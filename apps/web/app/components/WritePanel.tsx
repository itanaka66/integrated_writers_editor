"use client";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { api, post, put, del, streamSSE, postFile, downloadFile } from "../lib/api";
import { Episode, Project, Source, Template } from "../lib/types";
import { useVoiceInput } from "../lib/useVoiceInput";
import { useResizableWidth } from "../lib/useResizableWidth";
import DiffView from "./DiffView";
import ProofreadPanel from "./ProofreadPanel";
import Resizer from "./Resizer";
import { useLlmActivity, LlmActivityHandle } from "../lib/llmActivity";
import { MessageKey, useLocale, useT } from "../lib/i18n";

type Tool = {
  key: string;
  labelKey: MessageKey;
  mode?: string; // reuse a built-in /ai/generate mode (continue / summary) as-is
  // When set, the user picks one before the prompt is sent. `value` is what is
  // interpolated into the (Japanese) LLM prompt and must stay as-is; only
  // `labelKey` (the displayed name) is translated.
  options?: { value: string; labelKey: MessageKey }[];
  buildPrompt?: (choice?: string) => string;
};

// NOTE: the strings returned by buildPrompt are LLM prompts and intentionally
// stay Japanese (the AI's working language is out of scope for UI i18n).
const TOOL_GROUPS: { titleKey: MessageKey; tools: Tool[] }[] = [
  {
    titleKey: "write.group.plan",
    tools: [
      { key: "idea", labelKey: "write.tool.idea", buildPrompt: () => "現在の記事のテーマについて、面白い切り口のアイデアを5つ提案してください。" },
      {
        key: "structure",
        labelKey: "write.tool.structure",
        options: [
          { value: "SEO記事", labelKey: "write.opt.seo" },
          { value: "ニュース記事", labelKey: "write.opt.news" },
          { value: "解説記事", labelKey: "write.opt.explainer" },
        ],
        buildPrompt: (choice) => `この記事を${choice}として構成し直す場合の見出し構成案を作成してください。各見出しで書くべき内容も簡潔に添えてください。`,
      },
      { key: "seo", labelKey: "write.tool.seo", buildPrompt: () => "この記事のテーマに関連するSEOキーワードを提案し、それぞれの検索意図を整理してください。" },
      { key: "target", labelKey: "write.tool.target", buildPrompt: () => "この記事は誰に向けて書かれているか、読者ターゲットを分析してください。文体・専門度がそのターゲットに合っているかも評価してください。" },
    ],
  },
  {
    titleKey: "write.group.assist",
    tools: [
      { key: "continue", labelKey: "write.tool.continue", mode: "continue" },
      { key: "improve", labelKey: "write.tool.improve", buildPrompt: () => "この文章を読みやすく、魅力的に書き直してください。" },
      { key: "headline", labelKey: "write.tool.headline", buildPrompt: () => "この記事の見出し・タイトルを、読者に伝わりやすく魅力的な案に改善してください。3案提案してください。" },
    ],
  },
  {
    titleKey: "write.group.quality",
    tools: [
      { key: "structureCheck", labelKey: "write.tool.structureCheck", buildPrompt: () => "この文章の構成を分析し、改善案を提案してください。" },
      { key: "factCheck", labelKey: "write.tool.factCheck", buildPrompt: () => "この記事の内容に事実誤認や誤った情報がないか、あなたの知識に基づいて指摘してください。断定はせず、確認が必要な箇所として提示してください。" },
      { key: "consistency", labelKey: "write.tool.consistency", buildPrompt: () => "この文章内で時系列・数値・固有名詞などに矛盾がないか指摘してください。" },
      { key: "review", labelKey: "write.tool.review", buildPrompt: () => "この文章を読者目線で評価し、改善点を具体的に提案してください。" },
      { key: "typo", labelKey: "write.tool.typo", buildPrompt: () => "この文章に誤字脱字・表記ゆれ・文法的な誤りがないかチェックし、該当箇所と修正案を一覧にしてください。" },
    ],
  },
  {
    titleKey: "write.group.convert",
    tools: [
      { key: "summary", labelKey: "write.tool.summary", mode: "summary" },
      {
        key: "convert",
        labelKey: "write.tool.convert",
        options: [
          { value: "SNS投稿", labelKey: "write.opt.sns" },
          { value: "メルマガ", labelKey: "write.opt.newsletter" },
          { value: "プレスリリース", labelKey: "write.opt.pressRelease" },
        ],
        buildPrompt: (choice) => `この記事を${choice}向けに書き直してください。文字数や文体はその媒体に適した形にしてください。`,
      },
      { key: "catchphrase", labelKey: "write.tool.catchphrase", buildPrompt: () => "この記事の内容をもとに、読者の興味を引くキャッチコピーを5案提案してください。短く印象的なものと、内容を具体的に伝えるものをバランスよく含めてください。" },
    ],
  },
];

type Revision = { id: number; title: string; summary: string; created_at: string };

export default function WritePanel({ project }: { project: Project }) {
  const t = useT();
  const locale = useLocale();
  const [es, setEs] = useState<Episode[]>([]);
  const [e, setE] = useState<Episode | null>(null);
  const [ai, setAi] = useState("");
  const [busy, setBusy] = useState(false);
  const [inst, setInst] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [preview, setPreview] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [openChoiceTool, setOpenChoiceTool] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [diffTarget, setDiffTarget] = useState<{ before: string; after: string; readOnly: boolean } | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showProofread, setShowProofread] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showNewArticle, setShowNewArticle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTemplateId, setNewTemplateId] = useState<number | "">("");
  const leftPanel = useResizableWidth("ine-write-left-width", { defaultWidth: 190, min: 140, max: 320, direction: "left" });
  const rightPanel = useResizableWidth("ine-write-right-width", { defaultWidth: 280, min: 220, max: 460, direction: "right" });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const docxInputRef = useRef<HTMLInputElement | null>(null);
  const voice = useVoiceInput((text) => {
    if (!e) return;
    const ta = textareaRef.current;
    const pos = ta ? ta.selectionStart : e.content.length;
    const next = e.content.slice(0, pos) + text + e.content.slice(pos);
    setE({ ...e, content: next });
  });

  async function load() {
    const d = await api(`/projects/${project.id}/episodes`);
    setEs(d);
    setE(d[0] || null);
  }
  useEffect(() => { load(); }, [project.id]);
  useEffect(() => { api(`/projects/${project.id}/templates`).then(setTemplates).catch(() => {}); }, [project.id]);

  async function loadSources(episodeId: number) {
    setSources(await api(`/episodes/${episodeId}/sources`));
  }
  useEffect(() => { if (e) loadSources(e.id); }, [e?.id]);

  async function addSource() {
    if (!e || !sourceTitle.trim()) return;
    await post(`/episodes/${e.id}/sources`, { title: sourceTitle, url: sourceUrl, note: sourceNote });
    setSourceTitle(""); setSourceUrl(""); setSourceNote("");
    await loadSources(e.id);
  }
  async function removeSource(id: number) {
    if (!e) return;
    await del(`/sources/${id}`);
    await loadSources(e.id);
  }

  function openNewArticle() {
    setNewTitle(""); setNewTemplateId(""); setShowNewArticle(true);
  }
  async function createArticle() {
    if (!newTitle.trim()) return;
    const number = (es[es.length - 1]?.number || 0) + 1;
    const template = templates.find((tpl) => tpl.id === newTemplateId);
    await post(`/projects/${project.id}/episodes`, { number, title: newTitle, summary: "", content: template?.structure || "" });
    setShowNewArticle(false);
    await load();
  }

  async function save() {
    if (!e) return;
    setBusy(true);
    try {
      const x = await put(`/episodes/${e.id}`, e);
      setE(x); setEs(es.map((v) => (v.id === x.id ? x : v))); setWarnings(x.warnings || []);
    } finally { setBusy(false); }
  }

  async function openHistory() {
    if (!e) return;
    setRevisions(await api(`/episodes/${e.id}/revisions`));
    setShowHistory(true);
  }
  async function restoreRevision(revisionId: number) {
    if (!e) return;
    if (!confirm(t("write.confirmRestore"))) return;
    const x = await post(`/episodes/${e.id}/revisions/${revisionId}/restore`, {});
    setE(x); setEs(es.map((v) => (v.id === x.id ? x : v))); setShowHistory(false);
  }

  function wrapSelection(before: string, after: string = before) {
    if (!e) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selected = e.content.slice(start, end);
    const next = e.content.slice(0, start) + before + selected + after + e.content.slice(end);
    setE({ ...e, content: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }
  function insertLinePrefix(prefix: string) {
    if (!e) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = e.content.lastIndexOf("\n", start - 1) + 1;
    const next = e.content.slice(0, lineStart) + prefix + e.content.slice(lineStart);
    setE({ ...e, content: next });
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); });
  }

  const wordCount = (e?.content || "").replace(/\s/g, "").length;

  const cancelStreamRef = useRef<(() => void) | null>(null);
  const activityRef = useRef<LlmActivityHandle | null>(null);
  const llm = useLlmActivity();

  function aiRun(mode: string, instructionOverride?: string) {
    if (!e) return;
    cancelStreamRef.current?.();
    activityRef.current?.end();
    setBusy(true);
    setAi("");
    const instruction = instructionOverride ?? (inst || "既存の記事内容を守ってください");
    setInst(instruction);
    const body = { project_id: project.id, episode_id: e.id, instruction, mode, rag_limit: 6 };
    let text = "";
    const label = mode === "summary" ? t("write.aiSummary") : mode === "continue" ? t("write.aiContinue") : mode === "proofread" ? t("write.aiProofread") : t("write.aiGenerate");
    const act = llm.begin(label, { cancel: () => cancelStreamRef.current?.() });
    activityRef.current = act;
    cancelStreamRef.current = streamSSE(
      "/ai/generate/stream",
      (data) => {
        const event = data as { delta?: string; error?: string; done?: boolean };
        if (event.error) { setAi(event.error); return; }
        if (event.delta) { text += event.delta; setAi(text); act.update({ detail: t("llm.charsReceived", { count: text.length.toLocaleString(locale) }) }); }
      },
      () => { act.end(); if (activityRef.current === act) activityRef.current = null; setBusy(false); },
      body,
    );
  }

  useEffect(() => () => { cancelStreamRef.current?.(); activityRef.current?.end(); }, []);

  function runTool(tool: Tool, choice?: string) {
    setShowTools(false);
    setOpenChoiceTool(null);
    if (tool.mode) { aiRun(tool.mode); return; }
    if (tool.buildPrompt) aiRun("custom", tool.buildPrompt(choice));
  }

  async function openDiffAgainstAi() {
    if (!e || !ai) return;
    setDiffTarget({ before: e.content, after: ai, readOnly: false });
  }
  async function compareRevision(revisionId: number) {
    if (!e) return;
    const r = await api(`/episodes/${e.id}/revisions/${revisionId}`);
    setDiffTarget({ before: r.content, after: e.content, readOnly: true });
  }
  function applyDiff(merged: string) {
    if (!e) return;
    setE({ ...e, content: merged });
    setDiffTarget(null);
    setAi("");
  }

  // Writes both an HTML and a plain-text representation of the current
  // Markdown to the clipboard, so pasting into Word (or Gmail, Google Docs,
  // etc.) keeps bold/headings/lists as real formatting instead of literal
  // "**"/"##" characters — the plain-text form is the fallback for targets
  // that only accept text (a chat box, a terminal).
  async function copyForWord() {
    if (!e) return;
    const html = marked.parse(e.content || "", { async: false }) as string;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([e.content || ""], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(e.content || "");
      }
      setCopyStatus(t("write.copied"));
    } catch {
      setCopyStatus(t("write.copyFailed"));
    } finally {
      setTimeout(() => setCopyStatus(null), 3000);
    }
  }

  function openDocxImport() {
    if (!e) return;
    if (!confirm(t("write.confirmDocx"))) return;
    docxInputRef.current?.click();
  }
  async function handleDocxImportFile(file: File) {
    if (!e) return;
    try {
      const x = await postFile(`/episodes/${e.id}/docx-import`, file);
      setE(x); setEs(es.map((v) => (v.id === x.id ? x : v)));
      setCopyStatus(t("write.docxLoaded"));
    } catch {
      setCopyStatus(t("write.docxFailed"));
    } finally {
      setTimeout(() => setCopyStatus(null), 3000);
    }
  }
  async function downloadDocx() {
    if (!e) return;
    await downloadFile(`/episodes/${e.id}/docx-export`, `${e.title}.docx`);
  }

  const checklist = e ? [
    { label: t("write.check.title"), ok: !!e.title.trim() },
    { label: t("write.check.summary"), ok: !!e.summary.trim() },
    { label: t("write.check.length"), ok: e.content.replace(/\s/g, "").length >= 400 },
    { label: t("write.check.image"), ok: /!\[[^\]]*\]\([^)]+\)/.test(e.content) },
    { label: t("write.check.source"), ok: sources.length > 0 },
  ] : [];

  const newArticleModal = showNewArticle && (
    <div className="modalOverlay" onClick={() => setShowNewArticle(false)}>
      <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
        <h1>{t("write.newArticleTitle")}</h1>
        <label>{t("write.titleLabel")}<input value={newTitle} onChange={(x) => setNewTitle(x.target.value)} autoFocus /></label>
        <label>{t("write.templateOptional")}
          <select value={newTemplateId} onChange={(x) => setNewTemplateId(x.target.value ? Number(x.target.value) : "")}>
            <option value="">{t("write.blank")}</option>
            {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name || t("materials.untitledTemplate")}</option>)}
          </select>
        </label>
        <div className="modalActions">
          <button onClick={() => setShowNewArticle(false)}>{t("common.cancel")}</button>
          <button onClick={createArticle} disabled={!newTitle.trim()}>{t("newProject.create")}</button>
        </div>
      </div>
    </div>
  );

  if (!e) return <div className="panel"><p>{t("write.noArticles")}</p><button className="add" onClick={openNewArticle}>{t("write.addArticle")}</button>{newArticleModal}</div>;

  return (
    <div
      className="writeLayout"
      style={{ "--writeLeftW": `${leftPanel.width}px`, "--writeRightW": `${rightPanel.width}px` } as CSSProperties}
    >
      <aside className="writeEpisodeList">
        <div className="section">ARTICLES</div>
        <div className="episodes">
          {es.map((x) => <button className={e.id === x.id ? "ep active" : "ep"} onClick={() => setE(x)} key={x.id}>{x.title}</button>)}
        </div>
        <button className="newEpisode" onClick={openNewArticle}>{t("write.newArticleBtn")}</button>
        <Resizer side="right" onPointerDown={leftPanel.startDrag} />
      </aside>
      <section className="main">
        <div className="aiToolbar">
          <button className="aiToolbarOpen" disabled={busy} onClick={() => setShowTools(true)}>{t("write.toolsOpen")}</button>
        </div>
        <div className="writeHead">
          <div><small>ARTICLE</small><input value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} /></div>
          <div className="writeHeadActions">
            <button className="historyButton" onClick={() => setShowSources((v) => !v)}>{t("write.sources", { count: sources.length })}</button>
            <button className="historyButton" onClick={openHistory}>{t("write.history")}</button>
            <button className="historyButton" onClick={() => setShowChecklist(true)}>{t("write.checklist")}</button>
            <button className="historyButton" onClick={() => setShowProofread(true)}>{t("write.proofread")}</button>
            <button className="writeSaveButton" onClick={save}>{busy ? t("write.saving") : t("write.save")}</button>
          </div>
        </div>
        {warnings.length > 0 && <div className="saveWarnings">{warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}</div>}
        {showSources && (
          <div className="sourcesPanel">
            <div className="sourcesList">
              {sources.length === 0 && <p>{t("write.noSources")}</p>}
              {sources.map((s) => (
                <div className="sourceRow" key={s.id}>
                  <div>
                    <b>{s.title || t("common.untitled")}</b>
                    {s.url && <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>}
                    {s.note && <span>{s.note}</span>}
                  </div>
                  <button onClick={() => removeSource(s.id)}>{t("common.delete")}</button>
                </div>
              ))}
            </div>
            <div className="sourceForm">
              <input value={sourceTitle} onChange={(x) => setSourceTitle(x.target.value)} placeholder={t("write.sourceTitlePh")} />
              <input value={sourceUrl} onChange={(x) => setSourceUrl(x.target.value)} placeholder={t("write.sourceUrlPh")} />
              <input value={sourceNote} onChange={(x) => setSourceNote(x.target.value)} placeholder={t("write.sourceNotePh")} />
              <button onClick={addSource} disabled={!sourceTitle.trim()}>{t("write.addSource")}</button>
            </div>
          </div>
        )}
        <div className="summary"><small>SUMMARY</small><input value={e.summary} onChange={(x) => setE({ ...e, summary: x.target.value })} /></div>
        <div className="editorToolbar">
          <button onClick={() => wrapSelection("**")} title={t("write.bold")}>B</button>
          <button onClick={() => wrapSelection("*")} title={t("write.italic")}><i>I</i></button>
          <button onClick={() => insertLinePrefix("## ")} title={t("write.heading")}>H</button>
          <button onClick={() => insertLinePrefix("> ")} title={t("write.quote")}>❝</button>
          <button className={preview ? "on" : ""} onClick={() => setPreview((p) => !p)}>{preview ? t("write.backToEdit") : t("write.preview")}</button>
          {voice.supported && (
            <button className={voice.listening ? "on" : ""} onClick={voice.toggle} title={t("write.voice")}>{voice.listening ? t("write.voiceStop") : t("write.voiceStart")}</button>
          )}
          <button onClick={copyForWord} title={t("write.copyWordTitle")}>{t("write.copyWord")}</button>
          <button onClick={openDocxImport} title={t("write.importWordTitle")}>{t("write.importWord")}</button>
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx"
            style={{ display: "none" }}
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (file) handleDocxImportFile(file);
              ev.target.value = "";
            }}
          />
          <button onClick={downloadDocx} title={t("write.exportWordTitle")}>{t("write.exportWord")}</button>
          {copyStatus && <span className="savedNote">{copyStatus}</span>}
          <span className="wordCount">{t("write.wordCount", { count: wordCount.toLocaleString(locale) })}</span>
        </div>
        {preview ? (
          // Single-user app; the content is always this same user's own
          // Markdown (never third-party input), so raw HTML rendering here
          // carries no cross-user XSS risk.
          <div className="writersPreview" dangerouslySetInnerHTML={{ __html: marked.parse(e.content || "", { async: false }) as string }} />
        ) : (
          <textarea ref={textareaRef} className="writers" value={e.content} onChange={(x) => setE({ ...e, content: x.target.value })} />
        )}
      </section>
      <aside className="right">
        <Resizer side="left" onPointerDown={rightPanel.startDrag} />
        <b>AI EDITOR</b>
        <p className="context">{t("write.context")}</p>
        <div className="actions">
          <button onClick={() => aiRun("summary")}>{t("write.summaryBtn")}</button>
          <button onClick={() => setShowProofread(true)} title={t("write.proofreadTitle")}>{t("write.proofreadBtn")}</button>
        </div>
        <textarea className="instruction" value={inst} onChange={(x) => setInst(x.target.value)} placeholder={t("write.instructionPh")} />
        <div className="result"><small>AI RESULT</small><pre>{busy ? t("write.aiBusy") : ai || t("materials.resultPlaceholder")}</pre></div>
        {ai && (
          <div className="resultActions">
            <button className="adopt" onClick={() => { setE({ ...e, content: e.content + "\n\n" + ai }); setAi(""); }}>{t("write.append")}</button>
            <button className="adopt" onClick={openDiffAgainstAi}>{t("write.diffPreview")}</button>
          </div>
        )}
      </aside>
      {showTools && (
        <div className="modalOverlay" onClick={() => { setShowTools(false); setOpenChoiceTool(null); }}>
          <div className="modalCard toolPickerCard" onClick={(ev) => ev.stopPropagation()}>
            <h1>{t("write.toolsTitle")}</h1>
            {TOOL_GROUPS.map((group) => (
              <div className="toolGroup" key={group.titleKey}>
                <small>{t(group.titleKey)}</small>
                <div className="toolGroupItems">
                  {group.tools.map((tool) => (
                    <div key={tool.key} className="toolItem">
                      <button disabled={busy} onClick={() => (tool.options ? setOpenChoiceTool(openChoiceTool === tool.key ? null : tool.key) : runTool(tool))}>{t(tool.labelKey)}</button>
                      {tool.options && openChoiceTool === tool.key && (
                        <div className="toolChoices">
                          {tool.options.map((o) => (
                            <button key={o.value} disabled={busy} onClick={() => runTool(tool, o.value)}>{t(o.labelKey)}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="modalActions"><button onClick={() => { setShowTools(false); setOpenChoiceTool(null); }}>{t("common.close")}</button></div>
          </div>
        </div>
      )}
      {showHistory && (
        <div className="modalOverlay" onClick={() => setShowHistory(false)}>
          <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
            <h1>{t("write.historyTitle")}</h1>
            <p style={{ color: "#687386", fontSize: 12, margin: 0 }}>{t("write.historyNote")}</p>
            {revisions.length === 0 ? (
              <p>{t("write.noHistory")}</p>
            ) : (
              <div className="revisionList">
                {revisions.map((r) => (
                  <div className="revisionRow" key={r.id}>
                    <div><b>{r.title}</b><span>{new Date(r.created_at).toLocaleString(locale)}</span></div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => compareRevision(r.id)}>{t("write.compare")}</button>
                      <button onClick={() => restoreRevision(r.id)}>{t("write.restore")}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modalActions"><button onClick={() => setShowHistory(false)}>{t("common.close")}</button></div>
          </div>
        </div>
      )}
      {showProofread && e && (
        <ProofreadPanel
          episodeId={e.id}
          content={e.content}
          onApply={(next) => setE({ ...e, content: next })}
          onClose={() => setShowProofread(false)}
        />
      )}
      {diffTarget && (
        <DiffView
          before={diffTarget.before}
          after={diffTarget.after}
          readOnly={diffTarget.readOnly}
          onApply={applyDiff}
          onClose={() => setDiffTarget(null)}
        />
      )}
      {showChecklist && (
        <div className="modalOverlay" onClick={() => setShowChecklist(false)}>
          <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
            <h1>{t("write.checklistTitle")}</h1>
            <div className="checklist">
              {checklist.map((c, i) => (
                <div className={`checklistRow ${c.ok ? "ok" : "ng"}`} key={i}>
                  <span>{c.ok ? "✅" : "⚠"}</span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
            <div className="modalActions"><button onClick={() => setShowChecklist(false)}>{t("common.close")}</button></div>
          </div>
        </div>
      )}
      {newArticleModal}
    </div>
  );
}
