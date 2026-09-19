"use client";
import { useEffect, useState } from "react";
import { api, post } from "../lib/api";
import { Project } from "../lib/types";

type TextSearchMatch = { episode_id: number; number: number; title: string; count: number; snippets: string[] };
type MemoSearchMatch = { memo_id: number; category: string; title: string; count: number; snippets: string[] };
type TextReplaceEpisodeResult = { episode_id: number; number: number; title: string; replaced_count: number };

export default function SearchPanel({ projectId }: { projectId: number }) {
  const [mode, setMode] = useState<"semantic" | "replace">("semantic");
  const [q, setQ] = useState(""), [r, setR] = useState<any[]>([]), [source, setSource] = useState(""), [busy, setBusy] = useState(false);
  const [allProjects, setAllProjects] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const [findQ, setFindQ] = useState("");
  const [replaceQ, setReplaceQ] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(true);
  const [matches, setMatches] = useState<TextSearchMatch[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [memoMatches, setMemoMatches] = useState<MemoSearchMatch[]>([]);
  const [totalMemoMatches, setTotalMemoMatches] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [findBusy, setFindBusy] = useState(false);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replaceResult, setReplaceResult] = useState<{ episodes: TextReplaceEpisodeResult[]; total_replaced: number } | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => { api("/projects").then(setProjects).catch(() => {}); }, []);
  const nameOf = (pid: number) => projects.find((p) => p.id === pid)?.name || `#${pid}`;

  async function search() {
    setBusy(true);
    try {
      const x = allProjects
        ? await post("/rag/search-all", { query: q, limit: 12 })
        : await post("/rag/search", { project_id: projectId, query: q, limit: 8 });
      setR(x.results || []); setSource(x.source || "");
    } finally { setBusy(false); }
  }
  async function reindex() { const x = await post("/rag/index", { project_id: projectId }); alert(`索引を再構築しました (${x.indexed ?? 0}件)`); }

  async function findAll() {
    if (!findQ) return;
    setFindBusy(true); setReplaceResult(null);
    try {
      const x = await api(`/projects/${projectId}/text-search?${new URLSearchParams({ query: findQ, case_sensitive: String(caseSensitive) })}`);
      setMatches(x.matches || []); setTotalMatches(x.total_matches || 0);
      setMemoMatches(x.memo_matches || []); setTotalMemoMatches(x.total_memo_matches || 0);
      setSelected(new Set((x.matches || []).map((m: TextSearchMatch) => m.episode_id)));
      setSearched(true);
    } finally { setFindBusy(false); }
  }

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function replaceAll() {
    if (!findQ || selected.size === 0) return;
    if (!confirm(`選択した${selected.size}話で「${findQ}」を「${replaceQ}」に置換します。元に戻したい場合は各話の改訂履歴から復元できます。よろしいですか？`)) return;
    setReplaceBusy(true);
    try {
      const x = await post(`/projects/${projectId}/text-replace`, {
        query: findQ, replacement: replaceQ, case_sensitive: caseSensitive, episode_ids: Array.from(selected),
      });
      setReplaceResult(x);
      setMatches([]); setTotalMatches(0); setMemoMatches([]); setTotalMemoMatches(0); setSelected(new Set()); setSearched(false);
    } finally { setReplaceBusy(false); }
  }

  return (
    <div className="panel">
      <small>SEARCH</small>
      <h1>検索</h1>
      <div className="twinTabs">
        <button className={mode === "semantic" ? "on" : ""} onClick={() => setMode("semantic")}>意味検索</button>
        <button className={mode === "replace" ? "on" : ""} onClick={() => setMode("replace")}>検索・全置換</button>
      </div>
      {mode === "semantic" && (
        <>
          <p>本文をベクトル検索（Qdrant）します。接続できない場合はPostgreSQLの全文一致にフォールバックします。</p>
          <label className="searchAllToggle">
            <input type="checkbox" checked={allProjects} onChange={(e) => setAllProjects(e.target.checked)} /> すべての作品を検索対象にする
          </label>
          <div className="ragbar">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={allProjects ? "全作品の本文を意味検索" : "この作品の本文を意味検索"} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button onClick={search}>{busy ? "検索中…" : "検索"}</button>
            {!allProjects && <button onClick={reindex}>再構築</button>}
          </div>
          {source && <p className="searchSource">検索元：{source === "qdrant" ? "セマンティック検索 (Qdrant)" : "全文一致 (PostgreSQL フォールバック)"}</p>}
          {r.map((x, i) => (
            <div className="resultCard" key={i}>
              <b>{x.title}</b>
              {allProjects && <span className="resultProject">{x.project_name || nameOf(x.project_id)}</span>}
              <p>{x.text}</p>
            </div>
          ))}
        </>
      )}
      {mode === "replace" && (
        <>
          <p>この作品内の全話本文を対象に、文字列を検索・一括置換します。置換前の内容は改訂履歴に自動保存されます。</p>
          <div className="ragbar">
            <input value={findQ} onChange={(e) => setFindQ(e.target.value)} placeholder="検索する文字列" onKeyDown={(e) => e.key === "Enter" && findAll()} />
            <input value={replaceQ} onChange={(e) => setReplaceQ(e.target.value)} placeholder="置換後の文字列" />
            <button onClick={findAll} disabled={!findQ}>{findBusy ? "検索中…" : "検索"}</button>
          </div>
          <label className="searchAllToggle">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> 大文字・小文字を区別する
          </label>
          {totalMatches > 0 && (
            <>
              <p className="searchSource">{matches.length}話で合計{totalMatches}件ヒット。置換したい話を選択してください。</p>
              {matches.map((m) => (
                <div className="resultCard" key={m.episode_id}>
                  <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <input type="checkbox" checked={selected.has(m.episode_id)} onChange={() => toggleSelected(m.episode_id)} />
                    <b>第{m.number}話 {m.title}</b>
                    <span className="resultProject">{m.count}件</span>
                  </label>
                  {m.snippets.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              ))}
              <div className="entityFormActions">
                <button onClick={replaceAll} disabled={replaceBusy || selected.size === 0}>{replaceBusy ? "置換中…" : `選択した${selected.size}話を置換`}</button>
              </div>
            </>
          )}
          {totalMemoMatches > 0 && (
            <>
              <p className="searchSource">メモ{memoMatches.length}件で合計{totalMemoMatches}件ヒット（メモは置換対象外です。「資料」から編集してください）。</p>
              {memoMatches.map((m) => (
                <div className="resultCard" key={m.memo_id}>
                  <b>{m.title || "（無題）"}</b>
                  <span className="resultProject">{m.category}・{m.count}件</span>
                  {m.snippets.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              ))}
            </>
          )}
          {searched && !findBusy && totalMatches === 0 && totalMemoMatches === 0 && replaceResult === null && (
            <p className="searchSource">一致する話・メモがありませんでした。</p>
          )}
          {replaceResult && (
            <p className="searchSource">
              {replaceResult.episodes.length}話・合計{replaceResult.total_replaced}件を置換しました。
            </p>
          )}
        </>
      )}
    </div>
  );
}
