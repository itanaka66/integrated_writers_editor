"use client";
import { useEffect, useState } from "react";
import { api, post } from "../lib/api";
import { Project } from "../lib/types";
import { useT } from "../lib/i18n";

type TextSearchMatch = { episode_id: number; number: number; title: string; count: number; snippets: string[] };
type MemoSearchMatch = { memo_id: number; category: string; title: string; count: number; snippets: string[] };
type TextReplaceEpisodeResult = { episode_id: number; number: number; title: string; replaced_count: number };

export default function SearchPanel({ projectId }: { projectId: number }) {
  const t = useT();
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
  async function reindex() { const x = await post("/rag/index", { project_id: projectId }); alert(t("search.reindexed", { count: x.indexed ?? 0 })); }

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
    if (!confirm(t("search.confirmReplace", { count: selected.size, find: findQ, replace: replaceQ }))) return;
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
      <h1>{t("search.title")}</h1>
      <div className="twinTabs">
        <button className={mode === "semantic" ? "on" : ""} onClick={() => setMode("semantic")}>{t("search.semanticTab")}</button>
        <button className={mode === "replace" ? "on" : ""} onClick={() => setMode("replace")}>{t("search.replaceTab")}</button>
      </div>
      {mode === "semantic" && (
        <>
          <p>{t("search.semanticIntro")}</p>
          <label className="searchAllToggle">
            <input type="checkbox" checked={allProjects} onChange={(e) => setAllProjects(e.target.checked)} /> {t("search.allProjects")}
          </label>
          <div className="ragbar">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={allProjects ? t("search.phAll") : t("search.phOne")} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button onClick={search}>{busy ? t("search.searching") : t("search.search")}</button>
            {!allProjects && <button onClick={reindex}>{t("search.reindex")}</button>}
          </div>
          {source && <p className="searchSource">{t("search.source", { source: source === "qdrant" ? t("search.sourceQdrant") : t("search.sourceFallback") })}</p>}
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
          <p>{t("search.replaceIntro")}</p>
          <div className="ragbar">
            <input value={findQ} onChange={(e) => setFindQ(e.target.value)} placeholder={t("search.findPh")} onKeyDown={(e) => e.key === "Enter" && findAll()} />
            <input value={replaceQ} onChange={(e) => setReplaceQ(e.target.value)} placeholder={t("search.replacePh")} />
            <button onClick={findAll} disabled={!findQ}>{findBusy ? t("search.searching") : t("search.search")}</button>
          </div>
          <label className="searchAllToggle">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> {t("search.caseSensitive")}
          </label>
          {totalMatches > 0 && (
            <>
              <p className="searchSource">{t("search.hits", { episodes: matches.length, total: totalMatches })}</p>
              {matches.map((m) => (
                <div className="resultCard" key={m.episode_id}>
                  <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <input type="checkbox" checked={selected.has(m.episode_id)} onChange={() => toggleSelected(m.episode_id)} />
                    <b>{t("search.episodeLabel", { number: m.number, title: m.title })}</b>
                    <span className="resultProject">{t("search.count", { count: m.count })}</span>
                  </label>
                  {m.snippets.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              ))}
              <div className="entityFormActions">
                <button onClick={replaceAll} disabled={replaceBusy || selected.size === 0}>{replaceBusy ? t("search.replacing") : t("search.replaceSelected", { count: selected.size })}</button>
              </div>
            </>
          )}
          {totalMemoMatches > 0 && (
            <>
              <p className="searchSource">{t("search.memoHits", { memos: memoMatches.length, total: totalMemoMatches })}</p>
              {memoMatches.map((m) => (
                <div className="resultCard" key={m.memo_id}>
                  <b>{m.title || t("common.untitled")}</b>
                  <span className="resultProject">{t("search.memoMeta", { category: m.category, count: m.count })}</span>
                  {m.snippets.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              ))}
            </>
          )}
          {searched && !findBusy && totalMatches === 0 && totalMemoMatches === 0 && replaceResult === null && (
            <p className="searchSource">{t("search.noMatch")}</p>
          )}
          {replaceResult && (
            <p className="searchSource">
              {t("search.replaced", { episodes: replaceResult.episodes.length, total: replaceResult.total_replaced })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
