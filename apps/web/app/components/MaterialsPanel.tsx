"use client";
import { useEffect, useState } from "react";
import { api, post, postForm, del } from "../lib/api";
import { Memo, Template } from "../lib/types";
import { useLlmActivity } from "../lib/llmActivity";
import { MessageKey, TFunction, useT } from "../lib/i18n";

type Tab = "research" | "summarize" | "memos" | "templates";

// These Japanese strings are the stored category values (saved to the API) -
// only their displayed labels are translated.
const CATEGORIES = ["リサーチ", "要約", "アイデア", "その他"];
const CATEGORY_LABEL_KEYS: Record<string, MessageKey> = {
  "リサーチ": "materials.catResearch",
  "要約": "materials.catSummary",
  "アイデア": "materials.catIdea",
  "その他": "materials.catOther",
};
function categoryLabel(t: TFunction, value: string): string {
  const key = CATEGORY_LABEL_KEYS[value];
  return key ? t(key) : value;
}

export default function MaterialsPanel({ projectId }: { projectId: number }) {
  const [tab, setTab] = useState<Tab>("research");
  const t = useT();
  return (
    <div className="panel materialsPanel">
      <div className="tabs">
        <button className={tab === "research" ? "on" : ""} onClick={() => setTab("research")}>{t("materials.tabResearch")}</button>
        <button className={tab === "summarize" ? "on" : ""} onClick={() => setTab("summarize")}>{t("materials.tabSummarize")}</button>
        <button className={tab === "memos" ? "on" : ""} onClick={() => setTab("memos")}>{t("materials.tabMemos")}</button>
        <button className={tab === "templates" ? "on" : ""} onClick={() => setTab("templates")}>{t("materials.tabTemplates")}</button>
      </div>
      {tab === "research" && <ResearchTab projectId={projectId} />}
      {tab === "summarize" && <SummarizeTab projectId={projectId} />}
      {tab === "memos" && <MemosTab projectId={projectId} />}
      {tab === "templates" && <TemplatesTab projectId={projectId} />}
    </div>
  );
}

function SaveAsMemoButton({ projectId, category, title, content }: { projectId: number; category: string; title: string; content: string }) {
  const [saved, setSaved] = useState(false);
  const t = useT();
  if (!content) return null;
  return (
    <button
      className="add"
      disabled={saved}
      onClick={async () => {
        await post(`/projects/${projectId}/memos`, { category, title, content });
        setSaved(true);
      }}
    >
      {saved ? t("materials.memoSaved") : t("materials.saveAsMemo")}
    </button>
  );
}

function ResearchTab({ projectId }: { projectId: number }) {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const llm = useLlmActivity();
  const t = useT();

  async function run() {
    if (!topic.trim()) return;
    setBusy(true);
    const act = llm.begin(t("materials.researchWorking"));
    try {
      const instruction = `次のテーマについて情報収集・リサーチしてください。関連する論点、押さえるべき観点、参考にすべき切り口を整理してください。\n\nテーマ: ${topic}`;
      const x = await post("/ai/generate", { project_id: projectId, instruction, mode: "custom", rag_limit: 6 });
      setResult(x.text || x.detail || "");
    } finally { act.end(); setBusy(false); }
  }

  return (
    <div className="materialsTab">
      <label>{t("materials.topic")}<input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("materials.topicPh")} /></label>
      <button onClick={run} disabled={busy || !topic.trim()}>{busy ? t("materials.researching") : t("materials.research")}</button>
      <div className="result"><small>RESULT</small><pre>{result || t("materials.resultPlaceholder")}</pre></div>
      <SaveAsMemoButton projectId={projectId} category="リサーチ" title={topic} content={result} />
    </div>
  );
}

function SummarizeTab({ projectId }: { projectId: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const llm = useLlmActivity();
  const t = useT();

  async function run() {
    if (!file && !text.trim()) return;
    setBusy(true);
    const act = llm.begin(t("materials.summarizeWorking"));
    try {
      const x = await postForm("/tools/summarize-material", file ? { file } : { text });
      setResult(x.summary || x.detail || "");
    } finally { act.end(); setBusy(false); }
  }

  return (
    <div className="materialsTab">
      <label>{t("materials.pdfFile")}<input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <label>{t("materials.pasteText")}<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("materials.pasteTextPh")} /></label>
      <button onClick={run} disabled={busy || (!file && !text.trim())}>{busy ? t("materials.summarizing") : t("materials.summarize")}</button>
      <div className="result"><small>SUMMARY</small><pre>{result || t("materials.resultPlaceholder")}</pre></div>
      <SaveAsMemoButton projectId={projectId} category="要約" title={file?.name || t("materials.defaultSummaryTitle")} content={result} />
    </div>
  );
}

function MemosTab({ projectId }: { projectId: number }) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const llm = useLlmActivity();
  const t = useT();

  async function load() {
    setMemos(await api(`/projects/${projectId}/memos`));
  }
  useEffect(() => { load(); }, [projectId]);

  async function add() {
    if (!content.trim()) return;
    await post(`/projects/${projectId}/memos`, { category, title, content });
    setTitle(""); setContent("");
    await load();
  }
  async function remove(id: number) {
    await del(`/memos/${id}`);
    await load();
  }

  async function createArticleFromMemo(memo: Memo) {
    const instruction = `次の箇条書き・メモをもとに、まとまった記事の下書きを作成してください。見出しを付け、読みやすい文章に展開してください。\n\nメモ:\n${memo.content}`;
    const act = llm.begin(t("materials.memoDraftWorking"));
    let x;
    try {
      x = await post("/ai/generate", { project_id: projectId, instruction, mode: "custom", rag_limit: 6 });
    } finally { act.end(); }
    const draft = x.text || x.detail || "";
    const eps = await api(`/projects/${projectId}/episodes`);
    const number = (eps[eps.length - 1]?.number || 0) + 1;
    await post(`/projects/${projectId}/episodes`, { number, title: memo.title || t("materials.untitledArticle"), summary: "", content: draft });
    alert(t("materials.articleCreated"));
  }

  const categories = ["all", ...Array.from(new Set(memos.map((m) => m.category).filter(Boolean)))];
  const visible = filter === "all" ? memos : memos.filter((m) => m.category === filter);

  return (
    <div className="materialsTab">
      <div className="memoForm">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("materials.memoTitlePh")} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("materials.memoContentPh")} />
        <button onClick={add} disabled={!content.trim()}>{t("materials.addMemo")}</button>
      </div>
      <div className="memoFilter">
        {categories.map((c) => (
          <button key={c} className={filter === c ? "on" : ""} onClick={() => setFilter(c)}>{c === "all" ? t("materials.all") : categoryLabel(t, c)}</button>
        ))}
      </div>
      <div className="memoList">
        {visible.length === 0 && <p>{t("materials.noMemos")}</p>}
        {visible.map((m) => (
          <div className="memoCard" key={m.id}>
            <div className="memoCardHead"><span>{categoryLabel(t, m.category)}</span><b>{m.title || t("common.untitled")}</b></div>
            <p>{m.content}</p>
            <div className="memoCardActions">
              <button onClick={() => createArticleFromMemo(m)}>{t("materials.toArticle")}</button>
              <button onClick={() => remove(m.id)}>{t("common.delete")}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplatesTab({ projectId }: { projectId: number }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [structure, setStructure] = useState("");
  const t = useT();

  async function load() {
    setTemplates(await api(`/projects/${projectId}/templates`));
  }
  useEffect(() => { load(); }, [projectId]);

  async function add() {
    if (!name.trim() || !structure.trim()) return;
    await post(`/projects/${projectId}/templates`, { name, structure });
    setName(""); setStructure("");
    await load();
  }
  async function remove(id: number) {
    await del(`/templates/${id}`);
    await load();
  }

  return (
    <div className="materialsTab">
      <div className="memoForm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("materials.templateNamePh")} />
        <textarea value={structure} onChange={(e) => setStructure(e.target.value)} placeholder={t("materials.templateStructurePh")} />
        <button onClick={add} disabled={!name.trim() || !structure.trim()}>{t("materials.saveTemplate")}</button>
      </div>
      <div className="memoList">
        {templates.length === 0 && <p>{t("materials.noTemplates")}</p>}
        {templates.map((tpl) => (
          <div className="memoCard" key={tpl.id}>
            <div className="memoCardHead"><b>{tpl.name || t("materials.untitledTemplate")}</b></div>
            <p>{tpl.structure}</p>
            <button onClick={() => remove(tpl.id)}>{t("common.delete")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
