"use client";
import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { api, post, put, del } from "../lib/api";
import { Episode, Project, Source, Template } from "../lib/types";
import { useVoiceInput } from "../lib/useVoiceInput";
import DiffView from "./DiffView";

type Tool = {
  key: string;
  label: string;
  mode?: string; // reuse a built-in /ai/generate mode (continue / summary) as-is
  options?: string[]; // when set, the user picks one before the prompt is sent
  buildPrompt?: (choice?: string) => string;
};

const TOOL_GROUPS: { title: string; tools: Tool[] }[] = [
  {
    title: "企画・構成",
    tools: [
      { key: "idea", label: "💡 アイデア生成", buildPrompt: () => "現在の記事のテーマについて、面白い切り口のアイデアを5つ提案してください。" },
      {
        key: "structure",
        label: "🧱 記事構成作成",
        options: ["SEO記事", "ニュース記事", "解説記事"],
        buildPrompt: (choice) => `この記事を${choice}として構成し直す場合の見出し構成案を作成してください。各見出しで書くべき内容も簡潔に添えてください。`,
      },
      { key: "seo", label: "🔑 SEOキーワード提案", buildPrompt: () => "この記事のテーマに関連するSEOキーワードを提案し、それぞれの検索意図を整理してください。" },
      { key: "target", label: "🎯 読者ターゲット分析", buildPrompt: () => "この記事は誰に向けて書かれているか、読者ターゲットを分析してください。文体・専門度がそのターゲットに合っているかも評価してください。" },
    ],
  },
  {
    title: "執筆支援",
    tools: [
      { key: "continue", label: "▶ 続きを書く", mode: "continue" },
      { key: "improve", label: "✎ 文章を改善", buildPrompt: () => "この文章を読みやすく、魅力的に書き直してください。" },
      { key: "headline", label: "🏷 見出し・タイトル改善", buildPrompt: () => "この記事の見出し・タイトルを、読者に伝わりやすく魅力的な案に改善してください。3案提案してください。" },
    ],
  },
  {
    title: "品質チェック",
    tools: [
      { key: "structureCheck", label: "🧩 構成チェック", buildPrompt: () => "この文章の構成を分析し、改善案を提案してください。" },
      { key: "factCheck", label: "✅ ファクトチェック", buildPrompt: () => "この記事の内容に事実誤認や誤った情報がないか、あなたの知識に基づいて指摘してください。断定はせず、確認が必要な箇所として提示してください。" },
      { key: "consistency", label: "⚠ 矛盾チェック", buildPrompt: () => "この文章内で時系列・数値・固有名詞などに矛盾がないか指摘してください。" },
      { key: "review", label: "👀 読者レビュー", buildPrompt: () => "この文章を読者目線で評価し、改善点を具体的に提案してください。" },
      { key: "typo", label: "🔤 誤字脱字チェック", buildPrompt: () => "この文章に誤字脱字・表記ゆれ・文法的な誤りがないかチェックし、該当箇所と修正案を一覧にしてください。" },
    ],
  },
  {
    title: "変換・要約",
    tools: [
      { key: "summary", label: "📝 要約", mode: "summary" },
      {
        key: "convert",
        label: "🔁 複数媒体への変換",
        options: ["SNS投稿", "メルマガ", "プレスリリース"],
        buildPrompt: (choice) => `この記事を${choice}向けに書き直してください。文字数や文体はその媒体に適した形にしてください。`,
      },
      { key: "catchphrase", label: "📣 キャッチコピー生成", buildPrompt: () => "この記事の内容をもとに、読者の興味を引くキャッチコピーを5案提案してください。短く印象的なものと、内容を具体的に伝えるものをバランスよく含めてください。" },
    ],
  },
];

type Revision = { id: number; title: string; summary: string; created_at: string };

export default function WritePanel({ project }: { project: Project }) {
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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showNewArticle, setShowNewArticle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTemplateId, setNewTemplateId] = useState<number | "">("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  useEffect(() => { api(`/projects/${project.id}/templates`).then(setTemplates); }, [project.id]);

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
    const template = templates.find((t) => t.id === newTemplateId);
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
    if (!confirm("この版に復元しますか？現在の内容は履歴として保存されます。")) return;
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

  async function aiRun(mode: string, instructionOverride?: string) {
    if (!e) return;
    setBusy(true);
    try {
      const instruction = instructionOverride ?? (inst || "既存の記事内容を守ってください");
      setInst(instruction);
      const x = await post("/ai/generate", { project_id: project.id, episode_id: e.id, instruction, mode, rag_limit: 6 });
      setAi(x.text || x.detail);
    } finally { setBusy(false); }
  }

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

  const checklist = e ? [
    { label: "タイトルが入力されている", ok: !!e.title.trim() },
    { label: "概要（サマリー）が入力されている", ok: !!e.summary.trim() },
    { label: "本文が400文字以上ある", ok: e.content.replace(/\s/g, "").length >= 400 },
    { label: "画像が挿入されている（Markdown画像記法）", ok: /!\[[^\]]*\]\([^)]+\)/.test(e.content) },
    { label: "出典が1件以上登録されている", ok: sources.length > 0 },
  ] : [];

  const newArticleModal = showNewArticle && (
    <div className="modalOverlay" onClick={() => setShowNewArticle(false)}>
      <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
        <h1>新規記事</h1>
        <label>タイトル *<input value={newTitle} onChange={(x) => setNewTitle(x.target.value)} autoFocus /></label>
        <label>テンプレート（任意）
          <select value={newTemplateId} onChange={(x) => setNewTemplateId(x.target.value ? Number(x.target.value) : "")}>
            <option value="">白紙から作成</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name || "（無題のテンプレート）"}</option>)}
          </select>
        </label>
        <div className="modalActions">
          <button onClick={() => setShowNewArticle(false)}>キャンセル</button>
          <button onClick={createArticle} disabled={!newTitle.trim()}>作成する</button>
        </div>
      </div>
    </div>
  );

  if (!e) return <div className="panel"><p>記事がまだありません。</p><button className="add" onClick={openNewArticle}>＋ 記事を追加</button>{newArticleModal}</div>;

  return (
    <div className="writeLayout">
      <aside className="writeEpisodeList">
        <div className="section">ARTICLES</div>
        <div className="episodes">
          {es.map((x) => <button className={e.id === x.id ? "ep active" : "ep"} onClick={() => setE(x)} key={x.id}>{x.title}</button>)}
        </div>
        <button className="newEpisode" onClick={openNewArticle}>＋ 新規記事</button>
      </aside>
      <section className="main">
        <div className="aiToolbar">
          <button className="aiToolbarOpen" disabled={busy} onClick={() => setShowTools(true)}>🛠 AIツール</button>
        </div>
        <div className="writeHead">
          <div><small>ARTICLE</small><input value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} /></div>
          <div className="writeHeadActions">
            <button className="historyButton" onClick={() => setShowSources((v) => !v)}>📚 出典（{sources.length}）</button>
            <button className="historyButton" onClick={openHistory}>🕘 履歴</button>
            <button className="historyButton" onClick={() => setShowChecklist(true)}>✅ 公開前チェック</button>
            <button onClick={save}>{busy ? "保存中" : "保存"}</button>
          </div>
        </div>
        {warnings.length > 0 && <div className="saveWarnings">{warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}</div>}
        {showSources && (
          <div className="sourcesPanel">
            <div className="sourcesList">
              {sources.length === 0 && <p>まだ出典が登録されていません。</p>}
              {sources.map((s) => (
                <div className="sourceRow" key={s.id}>
                  <div>
                    <b>{s.title || "（無題）"}</b>
                    {s.url && <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>}
                    {s.note && <span>{s.note}</span>}
                  </div>
                  <button onClick={() => removeSource(s.id)}>削除</button>
                </div>
              ))}
            </div>
            <div className="sourceForm">
              <input value={sourceTitle} onChange={(x) => setSourceTitle(x.target.value)} placeholder="出典タイトル *" />
              <input value={sourceUrl} onChange={(x) => setSourceUrl(x.target.value)} placeholder="URL（任意）" />
              <input value={sourceNote} onChange={(x) => setSourceNote(x.target.value)} placeholder="メモ（任意）" />
              <button onClick={addSource} disabled={!sourceTitle.trim()}>＋ 出典を追加</button>
            </div>
          </div>
        )}
        <div className="summary"><small>SUMMARY</small><input value={e.summary} onChange={(x) => setE({ ...e, summary: x.target.value })} /></div>
        <div className="editorToolbar">
          <button onClick={() => wrapSelection("**")} title="太字">B</button>
          <button onClick={() => wrapSelection("*")} title="斜体"><i>I</i></button>
          <button onClick={() => insertLinePrefix("## ")} title="見出し">H</button>
          <button onClick={() => insertLinePrefix("> ")} title="引用">❝</button>
          <button className={preview ? "on" : ""} onClick={() => setPreview((p) => !p)}>{preview ? "編集に戻る" : "プレビュー"}</button>
          {voice.supported && (
            <button className={voice.listening ? "on" : ""} onClick={voice.toggle} title="音声入力">{voice.listening ? "⏹ 停止" : "🎤 音声入力"}</button>
          )}
          <span className="wordCount">{wordCount.toLocaleString()}文字</span>
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
        <b>AI EDITOR</b>
        <p className="context">Context Builder：本文、RAGを統合</p>
        <div className="actions">
          <button onClick={() => aiRun("summary")}>要約</button>
          <button onClick={() => aiRun("proofread")}>校正</button>
        </div>
        <textarea className="instruction" value={inst} onChange={(x) => setInst(x.target.value)} placeholder="AIへの指示" />
        <div className="result"><small>AI RESULT</small><pre>{busy ? "AI処理中..." : ai || "結果がここに表示されます"}</pre></div>
        {ai && (
          <div className="resultActions">
            <button className="adopt" onClick={() => { setE({ ...e, content: e.content + "\n\n" + ai }); setAi(""); }}>＋ 本文に追加</button>
            <button className="adopt" onClick={openDiffAgainstAi}>⇄ 差分プレビュー</button>
          </div>
        )}
      </aside>
      {showTools && (
        <div className="modalOverlay" onClick={() => { setShowTools(false); setOpenChoiceTool(null); }}>
          <div className="modalCard toolPickerCard" onClick={(ev) => ev.stopPropagation()}>
            <h1>AIツール</h1>
            {TOOL_GROUPS.map((group) => (
              <div className="toolGroup" key={group.title}>
                <small>{group.title}</small>
                <div className="toolGroupItems">
                  {group.tools.map((t) => (
                    <div key={t.key} className="toolItem">
                      <button disabled={busy} onClick={() => (t.options ? setOpenChoiceTool(openChoiceTool === t.key ? null : t.key) : runTool(t))}>{t.label}</button>
                      {t.options && openChoiceTool === t.key && (
                        <div className="toolChoices">
                          {t.options.map((o) => (
                            <button key={o} disabled={busy} onClick={() => runTool(t, o)}>{o}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="modalActions"><button onClick={() => { setShowTools(false); setOpenChoiceTool(null); }}>閉じる</button></div>
          </div>
        </div>
      )}
      {showHistory && (
        <div className="modalOverlay" onClick={() => setShowHistory(false)}>
          <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
            <h1>変更履歴</h1>
            <p style={{ color: "#687386", fontSize: 12, margin: 0 }}>本文を上書き保存するたびに、直前の版が最大20件まで保存されます。</p>
            {revisions.length === 0 ? (
              <p>まだ履歴はありません（本文が変更されて保存されると記録されます）。</p>
            ) : (
              <div className="revisionList">
                {revisions.map((r) => (
                  <div className="revisionRow" key={r.id}>
                    <div><b>{r.title}</b><span>{new Date(r.created_at).toLocaleString("ja-JP")}</span></div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => compareRevision(r.id)}>比較</button>
                      <button onClick={() => restoreRevision(r.id)}>この版に復元</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modalActions"><button onClick={() => setShowHistory(false)}>閉じる</button></div>
          </div>
        </div>
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
            <h1>公開前チェックリスト</h1>
            <div className="checklist">
              {checklist.map((c) => (
                <div className={`checklistRow ${c.ok ? "ok" : "ng"}`} key={c.label}>
                  <span>{c.ok ? "✅" : "⚠"}</span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
            <div className="modalActions"><button onClick={() => setShowChecklist(false)}>閉じる</button></div>
          </div>
        </div>
      )}
      {newArticleModal}
    </div>
  );
}
