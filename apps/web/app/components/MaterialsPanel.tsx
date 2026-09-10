"use client";
import { useEffect, useState } from "react";
import { api, post, postForm, del } from "../lib/api";
import { Memo, Template } from "../lib/types";

type Tab = "research" | "summarize" | "memos" | "templates";

const CATEGORIES = ["リサーチ", "要約", "アイデア", "その他"];

export default function MaterialsPanel({ projectId }: { projectId: number }) {
  const [tab, setTab] = useState<Tab>("research");
  return (
    <div className="panel materialsPanel">
      <div className="tabs">
        <button className={tab === "research" ? "on" : ""} onClick={() => setTab("research")}>🔎 リサーチ</button>
        <button className={tab === "summarize" ? "on" : ""} onClick={() => setTab("summarize")}>📄 資料要約</button>
        <button className={tab === "memos" ? "on" : ""} onClick={() => setTab("memos")}>🗒 メモ</button>
        <button className={tab === "templates" ? "on" : ""} onClick={() => setTab("templates")}>📐 テンプレート</button>
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
      {saved ? "メモに保存しました" : "＋ メモとして保存"}
    </button>
  );
}

function ResearchTab({ projectId }: { projectId: number }) {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      const instruction = `次のテーマについて情報収集・リサーチしてください。関連する論点、押さえるべき観点、参考にすべき切り口を整理してください。\n\nテーマ: ${topic}`;
      const x = await post("/ai/generate", { project_id: projectId, instruction, mode: "custom", rag_limit: 6 });
      setResult(x.text || x.detail || "");
    } finally { setBusy(false); }
  }

  return (
    <div className="materialsTab">
      <label>テーマ<input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例）2024年のSEOトレンド" /></label>
      <button onClick={run} disabled={busy || !topic.trim()}>{busy ? "調査中..." : "リサーチする"}</button>
      <div className="result"><small>RESULT</small><pre>{result || "結果がここに表示されます"}</pre></div>
      <SaveAsMemoButton projectId={projectId} category="リサーチ" title={topic} content={result} />
    </div>
  );
}

function SummarizeTab({ projectId }: { projectId: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!file && !text.trim()) return;
    setBusy(true);
    try {
      const x = await postForm("/tools/summarize-material", file ? { file } : { text });
      setResult(x.summary || x.detail || "");
    } finally { setBusy(false); }
  }

  return (
    <div className="materialsTab">
      <label>PDFファイル<input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <label>またはテキストを貼り付け<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Web記事・社内資料の本文を貼り付けてください" /></label>
      <button onClick={run} disabled={busy || (!file && !text.trim())}>{busy ? "要約中..." : "要約する"}</button>
      <div className="result"><small>SUMMARY</small><pre>{result || "結果がここに表示されます"}</pre></div>
      <SaveAsMemoButton projectId={projectId} category="要約" title={file?.name || "資料要約"} content={result} />
    </div>
  );
}

function MemosTab({ projectId }: { projectId: number }) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [filter, setFilter] = useState<string>("all");

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
    const x = await post("/ai/generate", { project_id: projectId, instruction, mode: "custom", rag_limit: 6 });
    const draft = x.text || x.detail || "";
    const eps = await api(`/projects/${projectId}/episodes`);
    const number = (eps[eps.length - 1]?.number || 0) + 1;
    await post(`/projects/${projectId}/episodes`, { number, title: memo.title || "（無題の記事）", summary: "", content: draft });
    alert("記事を作成しました。「執筆」から編集できます。");
  }

  const categories = ["all", ...Array.from(new Set(memos.map((m) => m.category).filter(Boolean)))];
  const visible = filter === "all" ? memos : memos.filter((m) => m.category === filter);

  return (
    <div className="materialsTab">
      <div className="memoForm">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="タイトル（任意）" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="メモ内容" />
        <button onClick={add} disabled={!content.trim()}>＋ メモを追加</button>
      </div>
      <div className="memoFilter">
        {categories.map((c) => (
          <button key={c} className={filter === c ? "on" : ""} onClick={() => setFilter(c)}>{c === "all" ? "すべて" : c}</button>
        ))}
      </div>
      <div className="memoList">
        {visible.length === 0 && <p>メモがありません。</p>}
        {visible.map((m) => (
          <div className="memoCard" key={m.id}>
            <div className="memoCardHead"><span>{m.category}</span><b>{m.title || "（無題）"}</b></div>
            <p>{m.content}</p>
            <div className="memoCardActions">
              <button onClick={() => createArticleFromMemo(m)}>→ 記事を作成</button>
              <button onClick={() => remove(m.id)}>削除</button>
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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="テンプレート名（例：SEO記事構成）" />
        <textarea value={structure} onChange={(e) => setStructure(e.target.value)} placeholder="よく使う構成をMarkdownなどで記述してください（例：## 導入\n## 本論\n## まとめ）" />
        <button onClick={add} disabled={!name.trim() || !structure.trim()}>＋ テンプレートを保存</button>
      </div>
      <div className="memoList">
        {templates.length === 0 && <p>テンプレートがありません。</p>}
        {templates.map((t) => (
          <div className="memoCard" key={t.id}>
            <div className="memoCardHead"><b>{t.name || "（無題のテンプレート）"}</b></div>
            <p>{t.structure}</p>
            <button onClick={() => remove(t.id)}>削除</button>
          </div>
        ))}
      </div>
    </div>
  );
}
