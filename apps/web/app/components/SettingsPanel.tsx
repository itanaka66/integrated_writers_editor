"use client";
import { useEffect, useRef, useState } from "react";
import { api, del, downloadFile, getAuth, post, postFile, put } from "../lib/api";
import { Project } from "../lib/types";
import { ensureNotificationPermission, notify } from "../lib/notify";

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
  ai_provider: string;
  anthropic_api_key_is_set: boolean; anthropic_model: string;
  openai_api_key_is_set: boolean; openai_model: string;
  google_api_key_is_set: boolean; google_model: string;
  cors_origins: string; cors_origins_is_override: boolean;
};

const AI_PROVIDERS = [
  { value: "ollama", label: "ローカルLLM（Ollama）" },
  { value: "anthropic", label: "Claude（Anthropic）" },
  { value: "openai", label: "ChatGPT（OpenAI）" },
  { value: "google", label: "Gemini（Google）" },
];

type UserAccount = { username: string; email: string | null; is_admin: boolean; is_active: boolean; created_at: string };

type AiUsageSummaryRow = { provider: string; model: string; calls: number; input_tokens: number; output_tokens: number; estimated_cost_usd: number | null };
type AiUsageSummary = { rows: AiUsageSummaryRow[]; total_calls: number; total_input_tokens: number; total_output_tokens: number; total_estimated_cost_usd: number | null };
type AiUsageLogRow = { id: number; project_id: number | null; provider: string; model: string; input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null; created_at: string };

function formatCost(v: number | null): string {
  return v === null ? "不明" : `$${v.toFixed(4)}`;
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

const STYLE_GUIDE_CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: "translation", label: "翻訳文書・ローカライズ", hint: "複数の翻訳者が関わるため、表現や文体（です・ます調など）を揃えるために必要。" },
  { key: "technical", label: "Webサイト・マニュアル・技術文書（テクニカルライティング）", hint: "読者が迷わないよう、専門用語の扱い、簡潔な表現、レイアウトを統一する。" },
  { key: "academic", label: "学術論文・研究レポート", hint: "引用の形式や文献リストの書き方（APA、MLA、シカゴ・マニュアルなど）を統一するため。" },
  { key: "pr", label: "広報・ニュース・プレスリリース", hint: "企業イメージや媒体の信頼性を保つため、用字用語のルール（記者ハンドブックなど）が必要。" },
];
const ACADEMIC_CITATION_STYLES = ["APA", "MLA", "シカゴ・マニュアル", "その他"];

export default function SettingsPanel({ project, onSaved }: { project: Project; onSaved: (p: Project) => void }) {
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
    ai_provider: "ollama",
    anthropic_api_key: "", anthropic_model: "",
    openai_api_key: "", openai_model: "",
    google_api_key: "", google_model: "",
  });
  const [sysBusy, setSysBusy] = useState(false);
  const [sysSaved, setSysSaved] = useState(false);
  type TestResult = { ok: boolean; message: string; latency_ms: number };
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
    try {
      const r: TestResult = await post("/system-settings/test-connection", { target, url, model, api_key: apiKey });
      setTestResults((prev) => ({ ...prev, [resultKey]: r }));
    } catch {
      setTestResults((prev) => ({ ...prev, [resultKey]: { ok: false, message: "テストに失敗しました（通信エラー）。", latency_ms: 0 } }));
    }
  }

  function TestButton({ target, resultKey, url, model, apiKey }: { target: string; resultKey?: string; url?: string; model?: string; apiKey?: string }) {
    const key = resultKey ?? target;
    const result = testResults[key];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => testConnection(key, target, url, model, apiKey)} disabled={result === "testing"}>
          {result === "testing" ? "テスト中..." : "接続テスト"}
        </button>
        {result && result !== "testing" && (
          <span className={result.ok ? "savedNote" : "errorNote"}>
            {result.ok ? "✓" : "✗"} {result.message}（{result.latency_ms}ms）
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
    api("/users").then(setUsers).catch(() => setUsersError("ユーザー一覧の読み込みに失敗しました。管理者権限が必要です。"));
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
      setSelfPasswordError("新しいパスワード（確認）が一致しません。");
      return;
    }
    setSelfPasswordBusy(true);
    try {
      await post("/users/me/password", { current_password: selfPasswordForm.current_password, new_password: selfPasswordForm.new_password });
      setSelfPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setSelfPasswordSaved(true);
    } catch {
      setSelfPasswordError("現在のパスワードが正しくありません。");
    } finally { setSelfPasswordBusy(false); }
  }

  async function submitEmailEdit(username: string) {
    setUsersError("");
    try {
      await put(`/users/${encodeURIComponent(username)}`, { email: emailEditValue.trim() || null });
      setEmailEditFor(null); setEmailEditValue("");
      loadUsers();
    } catch {
      setUsersError("メールアドレスの更新に失敗しました。");
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
      setUsersError("ユーザーの追加に失敗しました。ユーザー名が既に使われている可能性があります。");
    } finally { setUserBusy(false); }
  }

  async function setUserActive(username: string, is_active: boolean) {
    setUsersError("");
    try {
      await put(`/users/${encodeURIComponent(username)}`, { is_active });
      loadUsers();
    } catch {
      setUsersError("更新に失敗しました。唯一の有効な管理者を無効化することはできません。");
    }
  }

  async function setUserAdmin(username: string, is_admin: boolean) {
    setUsersError("");
    try {
      await put(`/users/${encodeURIComponent(username)}`, { is_admin });
      loadUsers();
    } catch {
      setUsersError("更新に失敗しました。唯一の管理者を降格することはできません。");
    }
  }

  async function submitPasswordReset(username: string) {
    if (!resetPasswordValue) return;
    setUsersError("");
    try {
      await post(`/users/${encodeURIComponent(username)}/password`, { new_password: resetPasswordValue });
      setResetPasswordFor(null); setResetPasswordValue("");
    } catch {
      setUsersError("パスワードの変更に失敗しました。");
    }
  }

  async function deleteUserAccount(username: string) {
    if (!window.confirm(`ユーザー「${username}」を削除しますか？この操作は取り消せません。`)) return;
    setUsersError("");
    try {
      await del(`/users/${encodeURIComponent(username)}`);
      loadUsers();
    } catch {
      setUsersError("削除に失敗しました。");
    }
  }

  function applySettingsResponse(s: SystemSettings) {
    setSys(s);
    setSysForm({
      qdrant_url: s.qdrant_url, ollama_url: s.ollama_url, ollama_model: s.ollama_model,
      ollama_embed_model: s.ollama_embed_model,
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
      const { anthropic_api_key, openai_api_key, google_api_key, ...rest } = sysForm;
      const payload: Record<string, string> = { ...rest };
      if (anthropic_api_key) payload.anthropic_api_key = anthropic_api_key;
      if (openai_api_key) payload.openai_api_key = openai_api_key;
      if (google_api_key) payload.google_api_key = google_api_key;
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
            latest.status === "completed" ? "インポートが完了しました" : "インポートでエラーが発生しました",
            `${latest.source_filename}${latest.status === "completed" ? `（新規${latest.created_episodes}話・更新${latest.updated_episodes}話）` : `: ${latest.last_message}`}`,
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
    try {
      const { style_guide }: { style_guide: string } = await post(`/projects/${project.id}/style-guide/generate`, { category, detail: detail || "" });
      setForm((f) => ({ ...f, style_guide }));
      setShowStyleGuidePicker(false);
      setPendingAcademic(false);
    } finally { setStyleGuideBusy(false); }
  }

  return (
    <div className="panel">
      <small>SETTINGS</small>
      <h1>設定</h1>
      <div className="twinTabs">
        <button className={tab === "basic" ? "on" : ""} onClick={() => setTab("basic")}>基本設定</button>
        <button className={tab === "connection" ? "on" : ""} onClick={() => setTab("connection")}>接続設定</button>
        <button className={tab === "usage" ? "on" : ""} onClick={() => setTab("usage")}>使用状況</button>
        <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>ユーザー管理</button>
        <button className={tab === "import" ? "on" : ""} onClick={() => setTab("import")}>インポート</button>
        <button className={tab === "backup" ? "on" : ""} onClick={() => setTab("backup")}>バックアップ</button>
        <button className={tab === "export" ? "on" : ""} onClick={() => setTab("export")}>エクスポート</button>
      </div>
      {tab === "basic" && (
        <div className="entityForm" style={{ marginTop: 14 }}>
          <label>作品名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>ジャンル<input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} /></label>
          <label>あらすじ<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>作品ルール（詳細設定）<textarea value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} /></label>
          <label style={{ gridColumn: "1/-1" }}>
            スタイルガイド
            <textarea value={form.style_guide} onChange={(e) => setForm({ ...form, style_guide: e.target.value })} placeholder="「スタイルガイド生成」で作成するか、直接入力してください。" style={{ minHeight: 120 }} />
          </label>
          <div style={{ gridColumn: "1/-1" }}>
            <button type="button" onClick={() => setShowStyleGuidePicker(true)} disabled={styleGuideBusy}>{styleGuideBusy ? "生成中..." : "📐 スタイルガイド生成"}</button>
          </div>
          <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12, marginTop: -6 }}>
            用途に近い種類を選ぶと、既存の本文サンプルの文体・表記の傾向も踏まえて、より適したスタイルガイドを生成します。生成後は自由に編集でき、保存すると執筆画面の「文章校正」で使われます。
          </p>
          <div className="entityFormActions">
            <button onClick={save} disabled={busy}>{busy ? "保存中..." : "保存"}</button>
            {saved && <span className="savedNote">保存しました</span>}
          </div>
        </div>
      )}
      {showStyleGuidePicker && (
        <div className="modalOverlay" onClick={() => { setShowStyleGuidePicker(false); setPendingAcademic(false); }}>
          <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
            <h1>スタイルガイドの種類を選択</h1>
            <p style={{ color: "#687386", fontSize: 12 }}>用途に近いものを選んでください。</p>
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
                    <b>{c.label}</b>
                    <div style={{ fontSize: 11, color: "#687386", fontWeight: "normal" }}>{c.hint}</div>
                  </button>
                ))}
              </div>
            )}
            {pendingAcademic && (
              <>
                <label>
                  引用形式
                  <select value={academicDetail} onChange={(e) => setAcademicDetail(e.target.value)}>
                    {ACADEMIC_CITATION_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <div className="modalActions">
                  <button type="button" onClick={() => setPendingAcademic(false)}>戻る</button>
                  <button type="button" onClick={() => generateStyleGuide("academic", academicDetail)} disabled={styleGuideBusy}>{styleGuideBusy ? "生成中..." : "この形式で生成する"}</button>
                </div>
              </>
            )}
            <div className="modalActions">
              <button type="button" onClick={() => { setShowStyleGuidePicker(false); setPendingAcademic(false); }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {tab === "connection" && (
        <div className="entityForm" style={{ marginTop: 14 }}>
          {!sys && <p style={{ gridColumn: "1/-1" }}>読み込み中...</p>}
          {sys && (
            <>
              <label>
                SQL（データベース）<input value={sys.database_url_masked} readOnly disabled />
              </label>
              <div><TestButton target="database" /></div>
              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12, marginTop: -6 }}>
                データベース接続先は稼働中のアプリから安全に切り替えられないため、読み取り専用です。変更するにはサーバーの環境変数 <code>DATABASE_URL</code> を編集して再起動してください。
              </p>

              <label>
                Qdrant URL {sys.qdrant_url_is_override && <span className="savedNote">（上書き中）</span>}
                <input value={sysForm.qdrant_url} onChange={(e) => setSysForm({ ...sysForm, qdrant_url: e.target.value })} placeholder="http://qdrant:6333" />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="qdrant" url={sysForm.qdrant_url} />
                {sys.qdrant_url_is_override && <button type="button" onClick={() => resetField("qdrant_url")} disabled={sysBusy}>既定値に戻す</button>}
              </div>

              <label>
                Ollama 1（Writer）URL {sys.ollama_url_is_override && <span className="savedNote">（上書き中）</span>}
                <input value={sysForm.ollama_url} onChange={(e) => setSysForm({ ...sysForm, ollama_url: e.target.value })} placeholder="http://ollama:11434" />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="ollama" url={sysForm.ollama_url} model={sysForm.ollama_model} />
                {sys.ollama_url_is_override && <button type="button" onClick={() => resetField("ollama_url")} disabled={sysBusy}>既定値に戻す</button>}
              </div>

              <label>
                Ollama 1（Writer）モデル {sys.ollama_model_is_override && <span className="savedNote">（上書き中）</span>}
                <input value={sysForm.ollama_model} onChange={(e) => setSysForm({ ...sysForm, ollama_model: e.target.value })} />
              </label>
              {sys.ollama_model_is_override && <button type="button" onClick={() => resetField("ollama_model")} disabled={sysBusy}>既定値に戻す</button>}

              <label>
                Ollama 1（Writer）埋め込みモデル {sys.ollama_embed_model_is_override && <span className="savedNote">（上書き中）</span>}
                <input value={sysForm.ollama_embed_model} onChange={(e) => setSysForm({ ...sysForm, ollama_embed_model: e.target.value })} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="ollama" resultKey="ollama_embed" url={sysForm.ollama_url} model={sysForm.ollama_embed_model} />
                {sys.ollama_embed_model_is_override && <button type="button" onClick={() => resetField("ollama_embed_model")} disabled={sysBusy}>既定値に戻す</button>}
              </div>

              <label style={{ gridColumn: "1/-1" }}>
                使用するAIプロバイダー（記事生成・チャット・資料要約に使用）
                <select value={sysForm.ai_provider} onChange={(e) => setSysForm({ ...sysForm, ai_provider: e.target.value })}>
                  {AI_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12, marginTop: -6 }}>
                「ローカルLLM（Ollama）」を選ぶと、上のOllama 1（Writer）の設定が使われます。APIキーは保存後は値を表示しません（安全のため）。接続テストは、まだ保存していない場合は今入力した値でテストされます。
              </p>

              <label>
                Claude（Anthropic）APIキー {sys.anthropic_api_key_is_set && <span className="savedNote">（設定済み）</span>}
                <input type="password" value={sysForm.anthropic_api_key} onChange={(e) => setSysForm({ ...sysForm, anthropic_api_key: e.target.value })} placeholder={sys.anthropic_api_key_is_set ? "変更する場合のみ入力" : "sk-ant-..."} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="anthropic" model={sysForm.anthropic_model} apiKey={sysForm.anthropic_api_key} />
                {sys.anthropic_api_key_is_set && <button type="button" onClick={() => resetField("anthropic_api_key")} disabled={sysBusy}>クリア</button>}
              </div>
              <label>
                Claude モデル名
                <input value={sysForm.anthropic_model} onChange={(e) => setSysForm({ ...sysForm, anthropic_model: e.target.value })} placeholder="claude-sonnet-4-5" />
              </label>
              <div />

              <label>
                ChatGPT（OpenAI）APIキー {sys.openai_api_key_is_set && <span className="savedNote">（設定済み）</span>}
                <input type="password" value={sysForm.openai_api_key} onChange={(e) => setSysForm({ ...sysForm, openai_api_key: e.target.value })} placeholder={sys.openai_api_key_is_set ? "変更する場合のみ入力" : "sk-..."} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="openai" model={sysForm.openai_model} apiKey={sysForm.openai_api_key} />
                {sys.openai_api_key_is_set && <button type="button" onClick={() => resetField("openai_api_key")} disabled={sysBusy}>クリア</button>}
              </div>
              <label>
                ChatGPT モデル名
                <input value={sysForm.openai_model} onChange={(e) => setSysForm({ ...sysForm, openai_model: e.target.value })} placeholder="gpt-4o-mini" />
              </label>
              <div />

              <label>
                Gemini（Google）APIキー {sys.google_api_key_is_set && <span className="savedNote">（設定済み）</span>}
                <input type="password" value={sysForm.google_api_key} onChange={(e) => setSysForm({ ...sysForm, google_api_key: e.target.value })} placeholder={sys.google_api_key_is_set ? "変更する場合のみ入力" : "AIza..."} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <TestButton target="google" model={sysForm.google_model} apiKey={sysForm.google_api_key} />
                {sys.google_api_key_is_set && <button type="button" onClick={() => resetField("google_api_key")} disabled={sysBusy}>クリア</button>}
              </div>
              <label>
                Gemini モデル名
                <input value={sysForm.google_model} onChange={(e) => setSysForm({ ...sysForm, google_model: e.target.value })} placeholder="gemini-2.0-flash" />
              </label>
              <div />

              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12 }}>
                各項目を空欄にして保存すると、サーバーの環境変数の既定値に戻ります。Qdrant・Ollamaはいずれもステートレスなため、保存すると次回の呼び出しから即座に反映されます（再起動不要）。
              </p>
              <div className="entityFormActions">
                <button onClick={saveConnection} disabled={sysBusy}>{sysBusy ? "保存中..." : "保存"}</button>
                {sysSaved && <span className="savedNote">保存しました</span>}
              </div>
            </>
          )}
        </div>
      )}
      {tab === "usage" && (
        <div style={{ marginTop: 14 }}>
          {!usageSummary && <p>読み込み中...</p>}
          {usageSummary && (
            <>
              <p style={{ color: "#687386", fontSize: 12 }}>
                プロジェクトを問わず、このサーバー全体でのAI呼び出し実績です。金額は概算の目安であり、実際の請求額とは異なる場合があります（不明な場合は「不明」と表示されます）。ローカルLLM（Ollama）は常に$0として扱います。
              </p>
              <div className="progressStats">
                <div><small>総呼び出し回数</small><b>{usageSummary.total_calls}</b></div>
                <div><small>入力トークン合計</small><b>{usageSummary.total_input_tokens.toLocaleString()}</b></div>
                <div><small>出力トークン合計</small><b>{usageSummary.total_output_tokens.toLocaleString()}</b></div>
                <div><small>概算コスト合計</small><b>{formatCost(usageSummary.total_estimated_cost_usd)}</b></div>
              </div>
              <div className="stateTable" style={{ marginTop: 14 }}>
                {usageSummary.rows.length === 0 && <p style={{ padding: 12 }}>まだAI呼び出しの記録がありません。</p>}
                {usageSummary.rows.map((r) => (
                  <div className="stateRow" key={`${r.provider}-${r.model}`} style={{ gridTemplateColumns: "1fr 1fr 80px 100px 100px 100px" }}>
                    <span>{r.provider}</span>
                    <span>{r.model}</span>
                    <span>{r.calls}回</span>
                    <span>入力 {r.input_tokens.toLocaleString()}</span>
                    <span>出力 {r.output_tokens.toLocaleString()}</span>
                    <span>{formatCost(r.estimated_cost_usd)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20 }}>
                <small>直近の呼び出し履歴（最新{usageRecent.length}件）</small>
                {usageRecent.length === 0 && <p className="searchSource">まだ履歴がありません。</p>}
                {usageRecent.map((r) => (
                  <div className="resultCard" key={r.id}>
                    <b>{r.provider} / {r.model}</b>
                    <p>
                      入力{r.input_tokens ?? "?"}・出力{r.output_tokens ?? "?"}トークン / {formatCost(r.estimated_cost_usd)} / {new Date(r.created_at).toLocaleString("ja-JP")}
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
            <small>パスワードを変更</small>
            <input
              type="password" placeholder="現在のパスワード" value={selfPasswordForm.current_password}
              onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, current_password: e.target.value })}
            />
            <input
              type="password" placeholder="新しいパスワード" value={selfPasswordForm.new_password}
              onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, new_password: e.target.value })}
            />
            <input
              type="password" placeholder="新しいパスワード（確認）" value={selfPasswordForm.confirm_password}
              onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, confirm_password: e.target.value })}
            />
            <div className="entityFormActions">
              <button
                onClick={changeOwnPassword}
                disabled={selfPasswordBusy || !selfPasswordForm.current_password || !selfPasswordForm.new_password}
              >
                {selfPasswordBusy ? "変更中..." : "パスワードを変更"}
              </button>
              {selfPasswordSaved && <span className="savedNote">変更しました</span>}
            </div>
            {selfPasswordError && <p className="errorNote">{selfPasswordError}</p>}
          </div>

          {isAdmin && (
            <div style={{ marginTop: 28 }}>
              <small>ユーザー管理（管理者のみ）</small>
              {usersError && <p className="errorNote">{usersError}</p>}
              {!users && !usersError && <p>読み込み中...</p>}
              {users && (
                <>
                  <div className="stateTable" style={{ marginTop: 8 }}>
                    {users.map((u) => {
                      const isSelf = u.username === currentUsername;
                      return (
                        <div className="stateRow" key={u.username} style={{ gridTemplateColumns: "1fr 90px 90px 1fr 1fr 130px" }}>
                          <span><b>{u.username}</b>{isSelf && <small style={{ color: "#687386" }}>（自分）</small>}</span>
                          <span>
                            <label>
                              <input type="checkbox" checked={u.is_admin} onChange={(e) => setUserAdmin(u.username, e.target.checked)} /> 管理者
                            </label>
                          </span>
                          <span>
                            <label>
                              <input type="checkbox" checked={u.is_active} onChange={(e) => setUserActive(u.username, e.target.checked)} /> 有効
                            </label>
                          </span>
                          <span>
                            {emailEditFor === u.username ? (
                              <span style={{ display: "flex", gap: 6 }}>
                                <input
                                  type="email" placeholder="メールアドレス" value={emailEditValue}
                                  onChange={(e) => setEmailEditValue(e.target.value)}
                                />
                                <button onClick={() => submitEmailEdit(u.username)}>保存</button>
                                <button onClick={() => { setEmailEditFor(null); setEmailEditValue(""); }}>キャンセル</button>
                              </span>
                            ) : (
                              <button onClick={() => { setEmailEditFor(u.username); setEmailEditValue(u.email ?? ""); }}>
                                {u.email || "メール未設定"}
                              </button>
                            )}
                          </span>
                          <span>
                            {resetPasswordFor === u.username ? (
                              <span style={{ display: "flex", gap: 6 }}>
                                <input
                                  type="password" placeholder="新しいパスワード" value={resetPasswordValue}
                                  onChange={(e) => setResetPasswordValue(e.target.value)}
                                />
                                <button onClick={() => submitPasswordReset(u.username)}>変更</button>
                                <button onClick={() => { setResetPasswordFor(null); setResetPasswordValue(""); }}>キャンセル</button>
                              </span>
                            ) : (
                              <button onClick={() => { setResetPasswordFor(u.username); setResetPasswordValue(""); }}>パスワード変更</button>
                            )}
                          </span>
                          <span>
                            <button onClick={() => deleteUserAccount(u.username)} disabled={isSelf} title={isSelf ? "自分自身は削除できません" : ""}>削除</button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="entityForm" style={{ marginTop: 20 }}>
                    <small>新規ユーザーを追加</small>
                    <input
                      placeholder="ユーザー名" value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    />
                    <input
                      type="password" placeholder="パスワード" value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                    <label>
                      <input
                        type="checkbox" checked={newUser.is_admin}
                        onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                      /> 管理者権限を付与する
                    </label>
                    <button onClick={createNewUser} disabled={userBusy || !newUser.username.trim() || !newUser.password}>
                      {userBusy ? "追加中..." : "＋ ユーザーを追加"}
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
            なろう形式のテキストファイル（本編・下書きのどちらでも可）から、この作品「{project.name}」にエピソードを追加インポートします。既存の話数と重複する場合は本文を上書きし、上書き前の内容は改訂履歴に保存されます。
          </p>
          {(!importJob || importJob.status === "completed" || importJob.status === "error") && (
            <>
              <label>
                ファイル *
                <input type="file" accept=".txt" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              </label>
              <div className="entityFormActions">
                <button onClick={startImport} disabled={importBusy || !importFile}>{importBusy ? "開始中..." : "インポート開始"}</button>
              </div>
            </>
          )}
          {importJob && (
            <div style={{ gridColumn: "1/-1" }}>
              <p><b>{importJob.source_filename}</b></p>
              <div className="progress"><i style={{ width: `${importJob.progress_percent}%` }} /></div>
              <p className="searchSource">
                {importJob.status === "queued" && "キューに追加しました…"}
                {importJob.status === "running" && `${importJob.processed_episodes}/${importJob.total_episodes}話 処理中… ${importJob.last_message}`}
                {importJob.status === "completed" && importJob.last_message}
                {importJob.status === "error" && `エラー: ${importJob.last_message}`}
              </p>
            </div>
          )}
        </div>
      )}
      {tab === "backup" && (
        <div className="entityForm" style={{ marginTop: 14 }}>
          {!backupStatus && <p style={{ gridColumn: "1/-1" }}>読み込み中...</p>}
          {backupStatus && (
            <>
              <p style={{ gridColumn: "1/-1" }}>
                データベース（PostgreSQL）とQdrantのバックアップです。全プロジェクト共通のサーバー全体の機能で、この作品専用の設定ではありません。
              </p>
              <p style={{ gridColumn: "1/-1", color: "#687386", fontSize: 12 }}>
                自動バックアップ：{backupStatus.enabled ? (
                  <span className="savedNote">✓ 有効（{Math.round(backupStatus.interval_seconds / 3600)}時間ごと、直近{backupStatus.retention_count}件を保持、保存先: {backupStatus.backup_dir}）</span>
                ) : (
                  <span>無効（環境変数 <code>BACKUP_ENABLED=true</code> で有効化できます。詳しくは動作要件のドキュメントを参照してください）</span>
                )}
              </p>
              <div className="entityFormActions">
                <button onClick={runBackupNow} disabled={backupBusy}>{backupBusy ? "バックアップ中..." : "今すぐバックアップ"}</button>
              </div>
              {backupResult && (
                <p style={{ gridColumn: "1/-1" }} className={backupResult.postgres_ok ? "savedNote" : "errorNote"}>
                  {backupResult.postgres_ok ? "✓" : "✗"} PostgreSQL: {backupResult.postgres_ok ? "成功" : backupResult.postgres_error}
                  {" / "}Qdrant: {backupResult.qdrant_ok ? "成功" : backupResult.qdrant_error}
                  （{backupResult.duration_seconds}秒）
                </p>
              )}
              <div style={{ gridColumn: "1/-1" }}>
                <small>バックアップ履歴（最新{backupStatus.backups.length}件）</small>
                {backupStatus.backups.length === 0 && <p className="searchSource">まだバックアップがありません。</p>}
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
                リストアは`scripts/restore.sh`から行います（確認プロンプトなしで現在のデータを置き換えるため、パスの確認を必ず行ってください）。詳しくは操作マニュアルの「バックアップとリストア」を参照してください。
              </p>
            </>
          )}
        </div>
      )}
      {tab === "export" && (
        <div className="exportSection">
          <p>作品全体のエピソードを書き出します。伏線・キャラクター等の設定データは含まれません（本文のみ）。</p>
          <div className="exportButtons">
            <button onClick={() => exportAs("txt")} disabled={!!exporting}>{exporting === "txt" ? "書き出し中..." : "テキスト (.txt)"}</button>
            <button onClick={() => exportAs("md")} disabled={!!exporting}>{exporting === "md" ? "書き出し中..." : "Markdown (.md)"}</button>
            <button onClick={() => exportAs("epub")} disabled={!!exporting}>{exporting === "epub" ? "書き出し中..." : "EPUB (.epub)"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
