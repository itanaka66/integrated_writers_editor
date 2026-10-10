"use client";
import { useEffect, useRef, useState } from "react";
import { api, del, downloadFile, getAuth, post, postFile, put } from "../lib/api";
import { Project } from "../lib/types";
import { ensureNotificationPermission, notify } from "../lib/notify";
import { useLlmActivity } from "../lib/llmActivity";
import { MessageKey, TFunction, useLocale, useT } from "../lib/i18n";

type ImportJob = {
  id: number; mode: "writers" | "episodes"; source_filename: string;
  status: "queued" | "running" | "completed" | "error";
  total_episodes: number; processed_episodes: number; created_episodes: number; updated_episodes: number;
  last_message: string; progress_percent: number;
};

type BackupEntry = { timestamp: string; has_postgres: boolean; has_qdrant: boolean; size_bytes: number };
type BackupStatus = { enabled: boolean; interval_seconds: number; retention_count: number; backup_dir: string; backups: BackupEntry[] };
type BackupResult = { timestamp: string; postgres_ok: boolean; postgres_error: string; qdrant_ok: boolean; qdrant_error: string; duration_seconds: number };

type SystemSettings = {
  database_url_masked: string;
  qdrant_url: string; qdrant_url_is_override: boolean;
  ollama_url: string; ollama_url_is_override: boolean;
  ollama_model: string; ollama_model_is_override: boolean;
  ollama_embed_model: string; ollama_embed_model_is_override: boolean;
  ollama_api_key_is_set: boolean;
  ai_provider: string;
  anthropic_api_key_is_set: boolean; anthropic_model: string;
  openai_api_key_is_set: boolean; openai_model: string;
  google_api_key_is_set: boolean; google_model: string;
  cors_origins: string; cors_origins_is_override: boolean;
};

const AI_PROVIDERS: { value: string; labelKey: MessageKey }[] = [
  { value: "ollama", labelKey: "settings.provider.ollama" },
  { value: "anthropic", labelKey: "settings.provider.anthropic" },
  { value: "openai", labelKey: "settings.provider.openai" },
  { value: "google", labelKey: "settings.provider.google" },
];

type UserAccount = { username: string; email: string | null; is_admin: boolean; is_active: boolean; created_at: string };

type AiUsageSummaryRow = { provider: string; model: string; calls: number; input_tokens: number; output_tokens: number; estimated_cost_usd: number | null };
type AiUsageSummary = { rows: AiUsageSummaryRow[]; total_calls: number; total_input_tokens: number; total_output_tokens: number; total_estimated_cost_usd: number | null };
type AiUsageLogRow = { id: number; project_id: number | null; provider: string; model: string; input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null; created_at: string };

function formatCost(v: number | null, t: TFunction): string {
  return v === null ? t("settings.usage.unknown") : `$${v.toFixed(4)}`;
}

// A style guide is never required to write, but leaving it truly blank
// means "文章校正" (proofread) has nothing to check against — this generic
// baseline fills the field automatically the first time a project's
// Settings screen loads with no style guide saved yet, so proofreading
// always has *something* to work with. It's just a starting point in the
// (unsaved) form; explicit "スタイルガイド生成" below replaces it with one
// tailored to an actual use case, and either way nothing is written to the
// project until 保存 is clicked.
const DEFAULT_STYLE_GUIDE = [
  "・文体は「ですます調」で統一する",
  "・専門用語は初出時に簡単な説明を添える",
  "・一文を短く区切り、読点を使いすぎない",
  "・表記ゆれ（漢字/ひらがな/カタカナ）を統一する",
  "・冗長な言い回しを避け、簡潔に書く",
].join("\n");

// `key` is sent to the API; only labelKey / hintKey (the displayed text) are translated.
const STYLE_GUIDE_CATEGORIES: { key: string; labelKey: MessageKey; hintKey: MessageKey }[] = [
  { key: "translation", labelKey: "settings.cat.translation.label", hintKey: "settings.cat.translation.hint" },
  { key: "technical", labelKey: "settings.cat.technical.label", hintKey: "settings.cat.technical.hint" },
  { key: "academic", labelKey: "settings.cat.academic.label", hintKey: "settings.cat.academic.hint" },
  { key: "pr", labelKey: "settings.cat.pr.label", hintKey: "settings.cat.pr.hint" },
];
// These Japanese strings are the values sent to the API (and interpolated into
// the LLM prompt) - only their displayed labels are translated.
const ACADEMIC_CITATION_STYLES = ["APA", "MLA", "シカゴ・マニュアル", "その他"];
const CITATION_LABEL_KEYS: Record<string, MessageKey> = {
  "シカゴ・マニュアル": "settings.cite.chicago",
  "その他": "settings.cite.other",
};

export default function SettingsPanel({ project, onSaved }: { project: Project; onSaved: (p: Project) => void }) {
  const t = useT();
  const locale = useLocale();
  const [tab, setTab] = useState<"basic" | "connection" | "usage" | "users" | "import" | "backup" | "export">("basic");
  const [usageSummary, setUsageSummary] = useState<AiUsageSummary | null>(null);
  const [usageRecent, setUsageRecent] = useState<AiUsageLogRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const importTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [form, setForm] = useState({ name: project.name, genre: project.genre, description: project.description, rules: project.rules, style_guide: project.style_guide });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [styleGuideBusy, setStyleGuideBusy] = useState(false);
  const [showStyleGuidePicker, setShowStyleGuidePicker] = useState(false);
  const [pendingAcademic, setPendingAcademic] = useState(false);
  const [academicDetail, setAcademicDetail] = useState(ACADEMIC_CITATION_STYLES[0]);

  useEffect(() => {
    if (tab !== "basic") return;
    if (!project.style_guide && !form.style_guide) setForm((f) => ({ ...f, style_guide: DEFAULT_STYLE_GUIDE }));
  }, [tab]);
  const [sys, setSys] = useState<SystemSettings | null>(null);
  const [sysForm, setSysForm] = useState({
    qdrant_url: "", ollama_url: "", ollama_model: "", ollama_embed_model: "",
    ollama_api_key: "",
    ai_provider: "ollama",
    anthropic_api_key: "", anthropic_model: "",
    openai_api_key: "", openai_model: "",
    google_api_key: "", google_model: "",
  });
  const [sysBusy, setSysBusy] = useState(false);
  const [sysSaved, setSysSaved] = useState(false);
  type TestResult = { ok: boolean; message: string; latency_ms: number };
  const llm = useLlmActivity();
  const [testResults, setTestResults] = useState<Record<string, TestResult | "testing" | undefined>>({});
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);

  async function loadBackupStatus() {
    setBackupStatus(await api("/backups"));
  }

  async function runBackupNow() {
    setBackupBusy(true); setBackupResult(null);
    try {
      const r: BackupResult = await post("/backups/run", {});
      setBackupResult(r);
      await loadBackupStatus();
    } finally { setBackupBusy(false); }
  }

  async function testConnection(resultKey: string, target: string, url?: string, model?: string, apiKey?: string) {
    setTestResults((prev) => ({ ...prev, [resultKey]: "testing" }));
    const act = llm.begin(t("settings.test.working"));
    try {
      const r: TestResult = await post("/system-settings/test-connection", { target, url, model, api_key: apiKey });
      setTestResults((prev) => ({ ...prev, [resultKey]: r }));
    } catch {
      setTestResults((prev) => ({ ...prev, [resultKey]: { ok: false, message: t("settings.test.failed"), latency_ms: 0 } }));
    } finally { act.end(); }
  }

  function TestButton({ target, resultKey, url, model, apiKey }: { target: string; resultKey?: string; url?: string; model?: string; apiKey?: string }) {
    const key = resultKey ?? target;
    const result = testResults[key];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => testConnection(key, target, url, model, apiKey)} disabled={result === "testing"}>
          {result === "testing" ? t("settings.test.testing") : t("settings.test.button")}
        </button>
        {result && result !== "testing" && (
          <span className={result.ok ? "savedNote" : "errorNote"}>
            {result.ok ? "✓" : "✗"} {result.message}{t("settings.test.latency", { ms: result.latency_ms })}
          </span>
        )}
      </span>
    );
  }

  useEffect(() => {
    if (tab !== "connection") return;
    api("/system-settings").then((s: SystemSettings) => {
      setSys(s);
      setSysForm({
        qdrant_url: s.qdrant_url, ollama_url: s.ollama_url, ollama_model: s.ollama_model,
        ollama_embed_model: s.ollama_embed_model,
        ollama_api_key: "",
        ai_provider: s.ai_provider,
        anthropic_api_key: "", anthropic_model: s.anthropic_model,
        openai_api_key: "", openai_model: s.openai_model,
        google_api_key: "", google_model: s.google_model,
      });
    });
  }, [tab]);

  useEffect(() => {
    if (tab !== "backup") return;
    loadBackupStatus();
  }, [tab]);

  useEffect(() => {
    if (tab !== "usage") return;
    api("/ai-usage/summary").then(setUsageSummary).catch(() => {});
    api("/ai-usage/recent?limit=50").then(setUsageRecent).catch(() => {});
  }, [tab]);

  const currentUsername = getAuth()?.u ?? "";
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [usersError, setUsersError] = useState("");
  const [newUser, setNewUser] = useState({ username: "", password: "", is_admin: false });
  const [userBusy, setUserBusy] = useState(false);
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [emailEditFor, setEmailEditFor] = useState<string | null>(null);
  const [emailEditValue, setEmailEditValue] = useState("");
  const [selfPasswordForm, setSelfPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [selfPasswordBusy, setSelfPasswordBusy] = useState(false);
  const [selfPasswordError, setSelfPasswordError] = useState("");
  const [selfPasswordSaved, setSelfPasswordSaved] = useState(false);

  function loadUsers() {
    setUsersError("");
    api("/users").then(setUsers).catch(() => setUsersError(t("settings.users.loadFailed")));
  }

  useEffect(() => {
    if (tab !== "users") return;
    api("/auth/me").then((me: { is_admin: boolean }) => setIsAdmin(me.is_admin)).catch(() => setIsAdmin(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== "users" || !isAdmin) return;
    loadUsers();
  }, [tab, isAdmin]);

  async function changeOwnPassword() {
    setSelfPasswordError(""); setSelfPasswordSaved(false);
    if (!selfPasswordForm.current_password || !selfPasswordForm.new_password) return;
    if (selfPasswordForm.new_password !== selfPasswordForm.confirm_password) {
      setSelfPasswordError(t("settings.users.mismatch"));
      return;
    }
    setSelfPasswordBusy(true);
    try {
      await post("/users/me/password", { current_password: selfPasswordForm.current_password, new_password: selfPasswordForm.new_password });
      setSelfPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setSelfPasswordSaved(true);
    } catch {
      setSelfPasswordError(t("settings.users.wrongCurrent"));
    } finally { setSelfPasswordBusy(false); }
  }

  async function submitEmailEdit(username: string) {
    setUsersError("");
    try {
      await put(`/users/${encodeURIComponent(username)}`, { email: emailEditValue.trim() || null });
      setEmailEditFor(null); setEmailEditValue("");
      loadUsers();
    } catch {
      setUsersError(t("settings.users.errEmail"));
    }
  }

  async function createNewUser() {
    if (!newUser.username.trim() || !newUser.password) return;
    setUserBusy(true); setUsersError("");
    try {
      await post("/users", newUser);
      setNewUser({ username: "", password: "", is_admin: false });
      loadUsers();
    } catch {
      setUsersError(t("settings.users.errAdd"));
    } finally { setUserBusy(false); }
  }

  async function setUserActive(username: string, is_active: boolean) {
    setUsersError("");
    try {
      await put(`/users/${encodeURIComponent(username)}`, { is_active });
      loadUsers();
    } catch {
      setUsersError(t("settings.users.errActive"));
    }
  }

  async function setUserAdmin(username: string, is_admin: boolean) {
    setUsersError("");
    try {
      await put(`/users/${encodeURIComponent(username)}`, { is_admin });
      loadUsers();
    } catch {
      setUsersError(t("settings.users.errDemote"));
    }
  }

  async function submitPasswordReset(username: string) {
    if (!resetPasswordValue) return;
    setUsersError("");
    try {
      await post(`/users/${encodeURIComponent(username)}/password`, { new_password: resetPasswordValue });
      setResetPasswordFor(null); setResetPasswordValue("");
    } catch {
      setUsersError(t("settings.users.errPassword"));
    }
  }

  async function deleteUserAccount(username: string) {
    if (!window.confirm(t("settings.users.confirmDelete", { name: username }))) return;
    setUsersError("");
    try {
      await del(`/users/${encodeURIComponent(username)}`);
      loadUsers();
    } catch {
      setUsersError(t("settings.users.errDelete"));
    }
  }

  function applySettingsResponse(s: SystemSettings) {
    setSys(s);
    setSysForm({
      qdrant_url: s.qdrant_url, ollama_url: s.ollama_url, ollama_model: s.ollama_model,
      ollama_embed_model: s.ollama_embed_model,
      ollama_api_key: "",
      ai_provider: s.ai_provider,
      // API keys never come back from the server (see SystemSettingsOut) —
      // always reset these to blank so re-saving unrelated fields can't
      // accidentally wipe a previously-stored key (see saveConnection).
      anthropic_api_key: "", anthropic_model: s.anthropic_model,
      openai_api_key: "", openai_model: s.openai_model,
      google_api_key: "", google_model: s.google_model,
    });
  }

  async function saveConnection() {
    setSysBusy(true); setSysSaved(false);
    try {
      // Blank api_key fields mean "leave unchanged" here, not "clear" — only
      // send them when the user actually typed a new key. Clearing a key is
      // a separate explicit action (the "クリア" button -> resetField).
      const { anthropic_api_key, openai_api_key, google_api_key, ollama_api_key, ...rest } = sysForm;
      const payload: Record<string, string> = { ...rest };
      if (anthropic_api_key) payload.anthropic_api_key = anthropic_api_key;
      if (openai_api_key) payload.openai_api_key = openai_api_key;
      if (google_api_key) payload.google_api_key = google_api_key;
      if (ollama_api_key) payload.ollama_api_key = ollama_api_key;
      const s: SystemSettings = await put("/system-settings", payload);
      applySettingsResponse(s);
      setSysSaved(true);
    } finally { setSysBusy(false); }
  }

  async function resetField(field: keyof typeof sysForm) {
    setSysBusy(true); setSysSaved(false);
    try {
      const s: SystemSettings = await put("/system-settings", { [field]: "" });
      applySettingsResponse(s);
      setSysSaved(true);
    } finally { setSysBusy(false); }
  }

  useEffect(() => () => { if (importTimer.current) clearInterval(importTimer.current); }, []);

  async function startImport() {
    if (!importFile) return;
    setImportBusy(true);
    ensureNotificationPermission();
    try {
      const j: ImportJob = await postFile(`/projects/${project.id}/import/episodes`, importFile);
      setImportJob(j);
      importTimer.current = setInterval(async () => {
        const latest: ImportJob = await api(`/import-jobs/${j.id}`);
        setImportJob(latest);
        if ((latest.status === "completed" || latest.status === "error") && importTimer.current) {
          clearInterval(importTimer.current);
          notify(
            latest.status === "completed" ? t("import.notifyDone") : t("import.notifyError"),
            `${latest.source_filename}${latest.status === "completed" ? t("settings.import.summaryDone", { created: latest.created_episodes, updated: latest.updated_episodes }) : `: ${latest.last_message}`}`,
          );
        }
      }, 2000);
    } finally { setImportBusy(false); }
  }

  async function exportAs(format: "txt" | "md" | "epub") {
    setExporting(format);
    try {
      await downloadFile(`/projects/${project.id}/export?format=${format}`, `${project.name}.${format}`);
    } finally { setExporting(null); }
  }

  async function save() {
    setBusy(true); setSaved(false);
    try {
      const x = await put(`/projects/${project.id}`, form);
      onSaved(x);
      setSaved(true);
    } finally { setBusy(false); }
  }

  async function generateStyleGuide(category: string, detail?: string) {
    setStyleGuideBusy(true);
    const act = llm.begin(t("settings.basic.generatingWorking"));
    try {
      const { style_guide }: { style_guide: string } = await post(`/projects/${project.id}/style-guide/generate`, { category, detail: detail || "" });
      setForm((f) => ({ ...f, style_guide }));
      setShowStyleGuidePicker(false);
      setPendingAcademic(false);
    } finally { act.end(); setStyleGuideBusy(false); }
  }

  return (
    <div className="panel">
      <small>SETTINGS</small>
      <h1>{t("settings.title")}</h1>
      <div className="twinTabs">
        <button className={tab === "basic" ? "on" : ""} onClick={() => setTab("basic")}>{t("settings.tab.basic")}</button>
        <button className={tab === "connection" ? "on" : ""} onClick={() => setTab("connection")}>{t("settings.tab.connection")}</button>
        <button className={tab === "usage" ? "on" : ""} onClick={() => setTab("usage")}>{t("settings.tab.usage")}</button>
        <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>{t("settings.tab.users")}</button>
        <button className={tab === "import" ? "on" : ""} onClick={() => setTab("import")}>{t("settings.tab.import")}</button>
        <button className={tab === "backup" ? "on" : ""} onClick={() => setTab("backup")}>{t("settings.tab.backup")}</button>
        <button className={tab === "export" ? "on" : ""} onClick={() => setTab("export")}>{t("settings.tab.export")}</button>
      </div>
      {tab === "basic" && (
        <div className="entityForm" style={{ marginTop: 14 }}>
          <label>{t("settings.basic.name")}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>{t("settings.basic.genre")}<input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} /></label>
          <label>{t("settings.basic.description")}<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>{t("settings.basic.rules")}<textarea value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} /></label>
          <label style={{ gridColumn: "1/-1" }}>
            {t("settings.basic.styleGuide")}
            <textarea value={form.style_guide} onChange={(e) => setForm({ ...form, style_guide: e.target.value })} placeholder={t("settings.basic.styleGuidePh")} style={{ minHeight: 120 }} />
          </label>
          <div style={{ gridColumn: "1/-1" }}>
            <button type="button" onClick={() => setShowStyleGuidePicker(true)} disabled={styleGuideBusy}>{styleGuideBusy ? t("settings.basic.generating") : t("settings.basic.generate")}</button>
          </div>
          <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12, marginTop: -6 }}>
            {t("settings.basic.styleGuideNote")}
          </p>
          <div className="entityFormActions">
            <button onClick={save} disabled={busy}>{busy ? t("settings.saving") : t("settings.save")}</button>
            {saved && <span className="savedNote">{t("settings.saved")}</span>}
          </div>
        </div>
      )}
      {showStyleGuidePicker && (
        <div className="modalOverlay" onClick={() => { setShowStyleGuidePicker(false); setPendingAcademic(false); }}>
          <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
            <h1>{t("settings.picker.title")}</h1>
            <p style={{ color: "#687386", fontSize: 12 }}>{t("settings.picker.hint")}</p>
            {!pendingAcademic && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {STYLE_GUIDE_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    disabled={styleGuideBusy}
                    onClick={() => (c.key === "academic" ? setPendingAcademic(true) : generateStyleGuide(c.key))}
                    style={{ textAlign: "left" }}
                  >
                    <b>{t(c.labelKey)}</b>
                    <div style={{ fontSize: 11, color: "#687386", fontWeight: "normal" }}>{t(c.hintKey)}</div>
                  </button>
                ))}
              </div>
            )}
            {pendingAcademic && (
              <>
                <label>
                  {t("settings.picker.citation")}
                  <select value={academicDetail} onChange={(e) => setAcademicDetail(e.target.value)}>
                    {ACADEMIC_CITATION_STYLES.map((s) => <option key={s} value={s}>{CITATION_LABEL_KEYS[s] ? t(CITATION_LABEL_KEYS[s]) : s}</option>)}
                  </select>
                </label>
                <div className="modalActions">
                  <button type="button" onClick={() => setPendingAcademic(false)}>{t("settings.picker.back")}</button>
                  <button type="button" onClick={() => generateStyleGuide("academic", academicDetail)} disabled={styleGuideBusy}>{styleGuideBusy ? t("settings.basic.generating") : t("settings.picker.generateThis")}</button>
                </div>
              </>
            )}
            <div className="modalActions">
              <button type="button" onClick={() => { setShowStyleGuidePicker(false); setPendingAcademic(false); }}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}
      {tab === "connection" && (
        <div className="entityForm" style={{ marginTop: 14 }}>
          {!sys && <p style={{ gridColumn: "1/-1" }}>{t("common.loading")}</p>}
          {sys && (
            <>
              <label>
                {t("settings.conn.sql")}<input value={sys.database_url_masked} readOnly disabled />
              </label>
              <div><TestButton target="database" /></div>
              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12, marginTop: -6 }}>
                {t("settings.conn.dbNotePre")}<code>DATABASE_URL</code>{t("settings.conn.dbNotePost")}
              </p>

              <label>
                Qdrant URL {sys.qdrant_url_is_override && <span className="savedNote">{t("settings.conn.override")}</span>}
                <input value={sysForm.qdrant_url} onChange={(e) => setSysForm({ ...sysForm, qdrant_url: e.target.value })} placeholder="http://qdrant:6333" />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="qdrant" url={sysForm.qdrant_url} />
                {sys.qdrant_url_is_override && <button type="button" onClick={() => resetField("qdrant_url")} disabled={sysBusy}>{t("settings.conn.reset")}</button>}
              </div>

              <label>
                {t("settings.conn.ollamaUrl")} {sys.ollama_url_is_override && <span className="savedNote">{t("settings.conn.override")}</span>}
                <input value={sysForm.ollama_url} onChange={(e) => setSysForm({ ...sysForm, ollama_url: e.target.value })} placeholder="http://ollama:11434" />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="ollama" url={sysForm.ollama_url} model={sysForm.ollama_model} apiKey={sysForm.ollama_api_key} />
                {sys.ollama_url_is_override && <button type="button" onClick={() => resetField("ollama_url")} disabled={sysBusy}>{t("settings.conn.reset")}</button>}
              </div>

              <label>
                {t("settings.conn.ollamaModel")} {sys.ollama_model_is_override && <span className="savedNote">{t("settings.conn.override")}</span>}
                <input value={sysForm.ollama_model} onChange={(e) => setSysForm({ ...sysForm, ollama_model: e.target.value })} />
              </label>
              {sys.ollama_model_is_override && <button type="button" onClick={() => resetField("ollama_model")} disabled={sysBusy}>{t("settings.conn.reset")}</button>}

              <label>
                {t("settings.conn.ollamaEmbed")} {sys.ollama_embed_model_is_override && <span className="savedNote">{t("settings.conn.override")}</span>}
                <input value={sysForm.ollama_embed_model} onChange={(e) => setSysForm({ ...sysForm, ollama_embed_model: e.target.value })} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="ollama" resultKey="ollama_embed" url={sysForm.ollama_url} model={sysForm.ollama_embed_model} apiKey={sysForm.ollama_api_key} />
                {sys.ollama_embed_model_is_override && <button type="button" onClick={() => resetField("ollama_embed_model")} disabled={sysBusy}>{t("settings.conn.reset")}</button>}
              </div>

              <label>
                {t("settings.conn.ollamaKey")} {sys.ollama_api_key_is_set && <span className="savedNote">{t("settings.conn.isSet")}</span>}
                <input type="password" value={sysForm.ollama_api_key} onChange={(e) => setSysForm({ ...sysForm, ollama_api_key: e.target.value })} placeholder={sys.ollama_api_key_is_set ? t("settings.conn.keyChange") : t("settings.conn.ollamaKeyPh")} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="ollama" resultKey="ollama_api_key" url={sysForm.ollama_url} model={sysForm.ollama_model} apiKey={sysForm.ollama_api_key} />
                {sys.ollama_api_key_is_set && <button type="button" onClick={() => resetField("ollama_api_key")} disabled={sysBusy}>{t("settings.conn.clear")}</button>}
              </div>

              <label style={{ gridColumn: "1/-1" }}>
                {t("settings.conn.provider")}
                <select value={sysForm.ai_provider} onChange={(e) => setSysForm({ ...sysForm, ai_provider: e.target.value })}>
                  {AI_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{t(p.labelKey)}</option>)}
                </select>
              </label>
              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12, marginTop: -6 }}>
                {t("settings.conn.providerNote")}
              </p>

              <label>
                {t("settings.conn.anthropicKey")} {sys.anthropic_api_key_is_set && <span className="savedNote">{t("settings.conn.isSet")}</span>}
                <input type="password" value={sysForm.anthropic_api_key} onChange={(e) => setSysForm({ ...sysForm, anthropic_api_key: e.target.value })} placeholder={sys.anthropic_api_key_is_set ? t("settings.conn.keyChange") : "sk-ant-..."} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="anthropic" model={sysForm.anthropic_model} apiKey={sysForm.anthropic_api_key} />
                {sys.anthropic_api_key_is_set && <button type="button" onClick={() => resetField("anthropic_api_key")} disabled={sysBusy}>{t("settings.conn.clear")}</button>}
              </div>
              <label>
                {t("settings.conn.anthropicModel")}
                <input value={sysForm.anthropic_model} onChange={(e) => setSysForm({ ...sysForm, anthropic_model: e.target.value })} placeholder="claude-sonnet-4-5" />
              </label>
              <div />

              <label>
                {t("settings.conn.openaiKey")} {sys.openai_api_key_is_set && <span className="savedNote">{t("settings.conn.isSet")}</span>}
                <input type="password" value={sysForm.openai_api_key} onChange={(e) => setSysForm({ ...sysForm, openai_api_key: e.target.value })} placeholder={sys.openai_api_key_is_set ? t("settings.conn.keyChange") : "sk-..."} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="openai" model={sysForm.openai_model} apiKey={sysForm.openai_api_key} />
                {sys.openai_api_key_is_set && <button type="button" onClick={() => resetField("openai_api_key")} disabled={sysBusy}>{t("settings.conn.clear")}</button>}
              </div>
              <label>
                {t("settings.conn.openaiModel")}
                <input value={sysForm.openai_model} onChange={(e) => setSysForm({ ...sysForm, openai_model: e.target.value })} placeholder="gpt-4o-mini" />
              </label>
              <div />

              <label>
                {t("settings.conn.googleKey")} {sys.google_api_key_is_set && <span className="savedNote">{t("settings.conn.isSet")}</span>}
                <input type="password" value={sysForm.google_api_key} onChange={(e) => setSysForm({ ...sysForm, google_api_key: e.target.value })} placeholder={sys.google_api_key_is_set ? t("settings.conn.keyChange") : "AIza..."} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="google" model={sysForm.google_model} apiKey={sysForm.google_api_key} />
                {sys.google_api_key_is_set && <button type="button" onClick={() => resetField("google_api_key")} disabled={sysBusy}>{t("settings.conn.clear")}</button>}
              </div>
              <label>
                {t("settings.conn.googleModel")}
                <input value={sysForm.google_model} onChange={(e) => setSysForm({ ...sysForm, google_model: e.target.value })} placeholder="gemini-2.0-flash" />
              </label>
              <div />

              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12 }}>
                {t("settings.conn.footNote")}
              </p>
              <div className="entityFormActions">
                <button onClick={saveConnection} disabled={sysBusy}>{sysBusy ? t("settings.saving") : t("settings.save")}</button>
                {sysSaved && <span className="savedNote">{t("settings.saved")}</span>}
              </div>
            </>
          )}
        </div>
      )}
      {tab === "usage" && (
        <div style={{ marginTop: 14 }}>
          {!usageSummary && <p>{t("common.loading")}</p>}
          {usageSummary && (
            <>
              <p style={{ color: "#687386", fontSize: 12 }}>
                {t("settings.usage.note")}
              </p>
              <div className="progressStats">
                <div><small>{t("settings.usage.totalCalls")}</small><b>{usageSummary.total_calls}</b></div>
                <div><small>{t("settings.usage.totalIn")}</small><b>{usageSummary.total_input_tokens.toLocaleString(locale)}</b></div>
                <div><small>{t("settings.usage.totalOut")}</small><b>{usageSummary.total_output_tokens.toLocaleString(locale)}</b></div>
                <div><small>{t("settings.usage.totalCost")}</small><b>{formatCost(usageSummary.total_estimated_cost_usd, t)}</b></div>
              </div>
              <div className="stateTable" style={{ marginTop: 14 }}>
                {usageSummary.rows.length === 0 && <p style={{ padding: 12 }}>{t("settings.usage.none")}</p>}
                {usageSummary.rows.map((r) => (
                  <div className="stateRow" key={`${r.provider}-${r.model}`} style={{ gridTemplateColumns: "1fr 1fr 80px 100px 100px 100px" }}>
                    <span>{r.provider}</span>
                    <span>{r.model}</span>
                    <span>{t("settings.usage.calls", { count: r.calls })}</span>
                    <span>{t("settings.usage.in", { count: r.input_tokens.toLocaleString(locale) })}</span>
                    <span>{t("settings.usage.out", { count: r.output_tokens.toLocaleString(locale) })}</span>
                    <span>{formatCost(r.estimated_cost_usd, t)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20 }}>
                <small>{t("settings.usage.recent", { count: usageRecent.length })}</small>
                {usageRecent.length === 0 && <p className="searchSource">{t("settings.usage.noHistory")}</p>}
                {usageRecent.map((r) => (
                  <div className="resultCard" key={r.id}>
                    <b>{r.provider} / {r.model}</b>
                    <p>
                      {t("settings.usage.entry", { input: r.input_tokens ?? "?", output: r.output_tokens ?? "?", cost: formatCost(r.estimated_cost_usd, t), date: new Date(r.created_at).toLocaleString(locale) })}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {tab === "users" && (
        <div style={{ marginTop: 14 }}>
          <div className="entityForm">
            <small>{t("settings.users.changePw")}</small>
            <input
              type="password" placeholder={t("settings.users.currentPh")} value={selfPasswordForm.current_password}
              onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, current_password: e.target.value })}
            />
            <input
              type="password" placeholder={t("settings.users.newPh")} value={selfPasswordForm.new_password}
              onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, new_password: e.target.value })}
            />
            <input
              type="password" placeholder={t("settings.users.confirmPh")} value={selfPasswordForm.confirm_password}
              onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, confirm_password: e.target.value })}
            />
            <div className="entityFormActions">
              <button
                onClick={changeOwnPassword}
                disabled={selfPasswordBusy || !selfPasswordForm.current_password || !selfPasswordForm.new_password}
              >
                {selfPasswordBusy ? t("settings.users.changing") : t("settings.users.changePw")}
              </button>
              {selfPasswordSaved && <span className="savedNote">{t("settings.users.changed")}</span>}
            </div>
            {selfPasswordError && <p className="errorNote">{selfPasswordError}</p>}
          </div>

          {isAdmin && (
            <div style={{ marginTop: 28 }}>
              <small>{t("settings.users.adminTitle")}</small>
              {usersError && <p className="errorNote">{usersError}</p>}
              {!users && !usersError && <p>{t("common.loading")}</p>}
              {users && (
                <>
                  <div className="stateTable" style={{ marginTop: 8 }}>
                    {users.map((u) => {
                      const isSelf = u.username === currentUsername;
                      return (
                        <div className="stateRow" key={u.username} style={{ gridTemplateColumns: "1fr 90px 90px 1fr 1fr 130px" }}>
                          <span><b>{u.username}</b>{isSelf && <small style={{ color: "#687386" }}>{t("settings.users.self")}</small>}</span>
                          <span>
                            <label>
                              <input type="checkbox" checked={u.is_admin} onChange={(e) => setUserAdmin(u.username, e.target.checked)} /> {t("settings.users.admin")}
                            </label>
                          </span>
                          <span>
                            <label>
                              <input type="checkbox" checked={u.is_active} onChange={(e) => setUserActive(u.username, e.target.checked)} /> {t("settings.users.active")}
                            </label>
                          </span>
                          <span>
                            {emailEditFor === u.username ? (
                              <span style={{ display: "flex", gap: 6 }}>
                                <input
                                  type="email" placeholder={t("settings.users.emailPh")} value={emailEditValue}
                                  onChange={(e) => setEmailEditValue(e.target.value)}
                                />
                                <button onClick={() => submitEmailEdit(u.username)}>{t("settings.save")}</button>
                                <button onClick={() => { setEmailEditFor(null); setEmailEditValue(""); }}>{t("common.cancel")}</button>
                              </span>
                            ) : (
                              <button onClick={() => { setEmailEditFor(u.username); setEmailEditValue(u.email ?? ""); }}>
                                {u.email || t("settings.users.noEmail")}
                              </button>
                            )}
                          </span>
                          <span>
                            {resetPasswordFor === u.username ? (
                              <span style={{ display: "flex", gap: 6 }}>
                                <input
                                  type="password" placeholder={t("settings.users.newPh")} value={resetPasswordValue}
                                  onChange={(e) => setResetPasswordValue(e.target.value)}
                                />
                                <button onClick={() => submitPasswordReset(u.username)}>{t("settings.users.change")}</button>
                                <button onClick={() => { setResetPasswordFor(null); setResetPasswordValue(""); }}>{t("common.cancel")}</button>
                              </span>
                            ) : (
                              <button onClick={() => { setResetPasswordFor(u.username); setResetPasswordValue(""); }}>{t("settings.users.changePwBtn")}</button>
                            )}
                          </span>
                          <span>
                            <button onClick={() => deleteUserAccount(u.username)} disabled={isSelf} title={isSelf ? t("settings.users.cannotDeleteSelf") : ""}>{t("common.delete")}</button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="entityForm" style={{ marginTop: 20 }}>
                    <small>{t("settings.users.addTitle")}</small>
                    <input
                      placeholder={t("settings.users.usernamePh")} value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    />
                    <input
                      type="password" placeholder={t("settings.users.passwordPh")} value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                    <label>
                      <input
                        type="checkbox" checked={newUser.is_admin}
                        onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                      /> {t("settings.users.grantAdmin")}
                    </label>
                    <button onClick={createNewUser} disabled={userBusy || !newUser.username.trim() || !newUser.password}>
                      {userBusy ? t("settings.users.adding") : t("settings.users.addBtn")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {tab === "import" && (
        <div className="entityForm" style={{ marginTop: 14 }}>
          <p style={{ gridColumn: "1/-1" }}>
            {t("settings.import.intro", { name: project.name })}
          </p>
          {(!importJob || importJob.status === "completed" || importJob.status === "error") && (
            <>
              <label>
                {t("import.file")}
                <input type="file" accept=".txt" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              </label>
              <div className="entityFormActions">
                <button onClick={startImport} disabled={importBusy || !importFile}>{importBusy ? t("import.starting") : t("import.start")}</button>
              </div>
            </>
          )}
          {importJob && (
            <div style={{ gridColumn: "1/-1" }}>
              <p><b>{importJob.source_filename}</b></p>
              <div className="progress"><i style={{ width: `${importJob.progress_percent}%` }} /></div>
              <p className="searchSource">
                {importJob.status === "queued" && t("import.queued")}
                {importJob.status === "running" && t("settings.import.running", { processed: importJob.processed_episodes, total: importJob.total_episodes, message: importJob.last_message })}
                {importJob.status === "completed" && importJob.last_message}
                {importJob.status === "error" && t("import.errorPrefix", { message: importJob.last_message })}
              </p>
            </div>
          )}
        </div>
      )}
      {tab === "backup" && (
        <div className="entityForm" style={{ marginTop: 14 }}>
          {!backupStatus && <p style={{ gridColumn: "1/-1" }}>{t("common.loading")}</p>}
          {backupStatus && (
            <>
              <p style={{ gridColumn: "1/-1" }}>
                {t("settings.backup.intro")}
              </p>
              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12 }}>
                {t("settings.backup.auto")}{backupStatus.enabled ? (
                  <span className="savedNote">{t("settings.backup.enabled", { hours: Math.round(backupStatus.interval_seconds / 3600), count: backupStatus.retention_count, dir: backupStatus.backup_dir })}</span>
                ) : (
                  <span>{t("settings.backup.disabledPre")}<code>BACKUP_ENABLED=true</code>{t("settings.backup.disabledPost")}</span>
                )}
              </p>
              <div className="entityFormActions">
                <button onClick={runBackupNow} disabled={backupBusy}>{backupBusy ? t("settings.backup.running") : t("settings.backup.run")}</button>
              </div>
              {backupResult && (
                <p style={{ gridColumn: "1/-1" }} className={backupResult.postgres_ok ? "savedNote" : "errorNote"}>
                  {backupResult.postgres_ok ? "✓" : "✗"} PostgreSQL: {backupResult.postgres_ok ? t("settings.backup.ok") : backupResult.postgres_error}
                  {" / "}Qdrant: {backupResult.qdrant_ok ? t("settings.backup.ok") : backupResult.qdrant_error}
                  {t("settings.backup.duration", { seconds: backupResult.duration_seconds })}
                </p>
              )}
              <div style={{ gridColumn: "1/-1" }}>
                <small>{t("settings.backup.history", { count: backupStatus.backups.length })}</small>
                {backupStatus.backups.length === 0 && <p className="searchSource">{t("settings.backup.none")}</p>}
                {backupStatus.backups.map((b) => (
                  <div className="resultCard" key={b.timestamp}>
                    <b>{b.timestamp}</b>
                    <p>
                      PostgreSQL: {b.has_postgres ? "✓" : "—"} / Qdrant: {b.has_qdrant ? "✓" : "—"} / {(b.size_bytes / 1024 / 1024).toFixed(1)}MB
                    </p>
                  </div>
                ))}
              </div>
              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12 }}>
                {t("settings.backup.restoreNote")}
              </p>
            </>
          )}
        </div>
      )}
      {tab === "export" && (
        <div className="exportSection">
          <p>{t("settings.export.intro")}</p>
          <div className="exportButtons">
            <button onClick={() => exportAs("txt")} disabled={!!exporting}>{exporting === "txt" ? t("settings.export.exporting") : t("settings.export.txt")}</button>
            <button onClick={() => exportAs("md")} disabled={!!exporting}>{exporting === "md" ? t("settings.export.exporting") : "Markdown (.md)"}</button>
            <button onClick={() => exportAs("epub")} disabled={!!exporting}>{exporting === "epub" ? t("settings.export.exporting") : "EPUB (.epub)"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
