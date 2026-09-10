"use client";
import { useEffect, useState } from "react";
import { api, del, post } from "../lib/api";

type Graph = { nodes: any[]; edges: any[] };

function GraphMini({ graph, timeline }: { graph: Graph; timeline?: boolean }) {
  const n = graph.nodes || [], e = graph.edges || [], w = 920, h = 470;
  const pos: any = {};
  n.forEach((x: any, i: number) => {
    const cols = timeline ? Math.min(5, Math.max(1, Math.ceil(Math.sqrt(n.length)))) : Math.max(1, Math.ceil(Math.sqrt(n.length)));
    const gapX = w / (cols + 1), rows = Math.ceil(n.length / cols), gapY = h / (rows + 1);
    pos[x.id] = { x: gapX * ((i % cols) + 1), y: gapY * (Math.floor(i / cols) + 1) };
  });
  return (
    <div className="miniGraph">
      <div className="graphToolbar"><span>{n.length} nodes / {e.length} edges</span></div>
      <svg viewBox={`0 0 ${w} ${h}`}>
        {e.map((x: any, i: number) => {
          const a = pos[x.source], b = pos[x.target];
          return a && b ? <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" opacity=".22" strokeWidth={1 + Math.min(x.weight || 1, 4)} /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} className="edgeLabel">{x.label}</text></g> : null;
        })}
        {n.map((x: any) => <g key={x.id}><circle cx={pos[x.id].x} cy={pos[x.id].y} r="28" className="nodeCircle" /><text x={pos[x.id].x} y={pos[x.id].y + 4} textAnchor="middle" className="nodeLabel">{x.label.length > 12 ? x.label.slice(0, 12) + "…" : x.label}</text></g>)}
      </svg>
    </div>
  );
}

type EntityRef = { id: number; name: string };
type RelationConfig = {
  entityLabel: string;
  listEntities: (pid: number) => Promise<EntityRef[]>;
  listRelations: (pid: number) => Promise<any[]>;
  createRelation: (pid: number, body: any) => Promise<any>;
  deleteRelation: (rid: number) => Promise<void>;
  fromKey: string; toKey: string;
  defaultRelationType: string;
};

function RelationEditor({ projectId, cfg, onChanged }: { projectId: number; cfg: RelationConfig; onChanged: () => void }) {
  const [entities, setEntities] = useState<EntityRef[]>([]);
  const [relations, setRelations] = useState<any[]>([]);
  const [from, setFrom] = useState<number | "">("");
  const [to, setTo] = useState<number | "">("");
  const [relationType, setRelationType] = useState(cfg.defaultRelationType);

  async function load() {
    const [es, rs] = await Promise.all([cfg.listEntities(projectId), cfg.listRelations(projectId)]);
    setEntities(es);
    setRelations(rs);
  }
  useEffect(() => { load(); }, [projectId]);

  const nameOf = (id: number) => entities.find((x) => x.id === id)?.name || `#${id}`;

  async function add() {
    if (!from || !to || from === to) return;
    await cfg.createRelation(projectId, { [cfg.fromKey]: from, [cfg.toKey]: to, relation_type: relationType, strength: 1, description: "" });
    setFrom(""); setTo("");
    await load();
    onChanged();
  }
  async function remove(rid: number) {
    await cfg.deleteRelation(rid);
    await load();
    onChanged();
  }

  return (
    <div className="relationSection">
      <small>{cfg.entityLabel}の関係を編集</small>
      <div className="relationForm">
        <select value={from} onChange={(e) => setFrom(e.target.value ? Number(e.target.value) : "")}>
          <option value="">from...</option>
          {entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : "")}>
          <option value="">to...</option>
          {entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input value={relationType} onChange={(e) => setRelationType(e.target.value)} placeholder="関係の種類" />
        <button onClick={add} disabled={!from || !to || from === to}>＋ 関係を追加</button>
      </div>
      {relations.length > 0 && (
        <div className="relationList">
          {relations.map((r) => (
            <div className="relationRow" key={r.id}>
              <span>{nameOf(r[cfg.fromKey])} → {nameOf(r[cfg.toKey])}（{r.relation_type}）</span>
              <button onClick={() => remove(r.id)}>削除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const characterRelationConfig: RelationConfig = {
  entityLabel: "キャラクター",
  listEntities: (pid) => api(`/projects/${pid}/characters`),
  listRelations: (pid) => api(`/projects/${pid}/character-relations`),
  createRelation: (pid, body) => post(`/projects/${pid}/character-relations`, body),
  deleteRelation: (rid) => del(`/character-relations/${rid}`),
  fromKey: "from_character_id", toKey: "to_character_id", defaultRelationType: "関係",
};

const worldRelationConfig: RelationConfig = {
  entityLabel: "世界観",
  listEntities: (pid) => api(`/projects/${pid}/world`),
  listRelations: (pid) => api(`/projects/${pid}/world-relations`),
  createRelation: (pid, body) => post(`/projects/${pid}/world-relations`, body),
  deleteRelation: (rid) => del(`/world-relations/${rid}`),
  fromKey: "from_world_id", toKey: "to_world_id", defaultRelationType: "関連",
};

function ContinuitySection({ projectId }: { projectId: number }) {
  const [issues, setIssues] = useState<any[]>([]), [busy, setBusy] = useState(false);
  async function run() { setBusy(true); const x = await post("/continuity/check", { project_id: projectId }); setIssues(x.issues || []); setBusy(false); }
  useEffect(() => { api(`/projects/${projectId}/continuity/issues`).then(setIssues); }, [projectId]);
  return (
    <div>
      <button className="add" onClick={run}>{busy ? "監査中…" : "▶ 全体を監査"}</button>
      <div className="issues">
        {issues.length === 0 ? <div className="card"><b>問題なし</b><p>まだ監査結果がありません。</p></div> :
          issues.map((x) => (
            <div className={`issue ${x.severity}`} key={x.id}>
              <div><b>{x.severity.toUpperCase()}</b><span> EP.{x.episode_number ?? "?"} / {x.issue_type}</span></div>
              <h3>{x.message}</h3><p><b>根拠：</b>{x.evidence}</p><p><b>修正案：</b>{x.suggestion}</p>
            </div>
          ))}
      </div>
    </div>
  );
}

function WordCountSection({ projectId }: { projectId: number }) {
  const [episodes, setEpisodes] = useState<any[]>([]);
  useEffect(() => { api(`/projects/${projectId}/episodes`).then(setEpisodes); }, [projectId]);
  const sorted = [...episodes].sort((a, b) => a.number - b.number);
  let cumulative = 0;
  const points = sorted.map((e) => {
    cumulative += (e.content || "").replace(/\s/g, "").length;
    return { number: e.number, chars: (e.content || "").replace(/\s/g, "").length, cumulative };
  });
  const total = cumulative;
  const w = 880, h = 220, maxY = Math.max(1, ...points.map((p) => p.cumulative));
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${h - (p.cumulative / maxY) * h}`).join(" ");

  return (
    <div>
      <div className="twinMetrics" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="metric"><small>総文字数</small><b>{total.toLocaleString()}</b></div>
        <div className="metric"><small>エピソード数</small><b>{points.length}</b></div>
        <div className="metric"><small>1話あたり平均</small><b>{points.length ? Math.round(total / points.length).toLocaleString() : 0}</b></div>
      </div>
      {points.length > 1 && (
        <div className="wordCountChart">
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <p className="graphHint">累積文字数の推移（話数順）。横軸はエピソード順、縦軸は累積文字数。</p>
        </div>
      )}
      <div className="stateTable" style={{ marginTop: 14 }}>
        {points.map((p) => (
          <div className="stateRow" key={p.number} style={{ gridTemplateColumns: "70px 1fr 1fr" }}>
            <b>EP.{p.number}</b><span>{p.chars.toLocaleString()}文字</span><span>累計 {p.cumulative.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [["overview", "概要"], ["characters", "人物関係図"], ["world", "世界観グラフ"], ["timeline", "時系列グラフ"], ["states", "状態履歴"], ["wordcount", "文字数"], ["continuity", "連続性"]] as const;

export default function AnalyticsPanel({ projectId }: { projectId: number }) {
  const [t, setT] = useState<any | null>(null), [busy, setBusy] = useState(false), [tab, setTab] = useState<string>("overview");
  async function load() { setBusy(true); try { setT(await api(`/projects/${projectId}/story-twin`)); } finally { setBusy(false); } }
  useEffect(() => { load(); }, [projectId]);
  if (!t) return <div className="panel"><small>ANALYTICS</small><h1>分析ダッシュボード</h1><p>作品全体の状態を統合しています…</p></div>;
  const m = t.metrics, h = t.health;
  return (
    <div className="panel twin">
      <small>ANALYTICS</small><h1>分析ダッシュボード</h1>
      <div className="twinHero">
        <div><small>STORY DIGITAL TWIN</small><h2>{t.project.name}</h2><p>人物・世界・時系列・プロット・伏線・状態履歴・連続性を1つの作品モデルとして統合。</p></div>
        <div className={`health ${h.label}`}><b>{h.score}</b><span>{h.label === "healthy" ? "安定" : h.label === "attention" ? "要注意" : "要監査"}</span></div>
      </div>
      <div className="twinMetrics">{[["EPISODES", m.episodes], ["CHARACTERS", m.characters], ["WORLD", m.world_entities], ["PLOTS", m.plots], ["FORESHADOW", m.foreshadowings], ["OPEN ISSUES", m.continuity_open], ["GRAPH NODES", m.graph_nodes], ["GRAPH EDGES", m.graph_edges]].map((x) => <div className="metric" key={x[0] as string}><small>{x[0]}</small><b>{x[1]}</b></div>)}</div>
      <div className="twinTabs">{TABS.map(([k, label]) => <button className={tab === k ? "on" : ""} onClick={() => setTab(k)} key={k}>{label}</button>)}<button onClick={load}>{busy ? "更新中…" : "↻ 再計算"}</button></div>
      {tab === "overview" && (
        <div className="twinGrid">
          <div className="twinCard"><h3>作品構造</h3><p>キャラクター {m.characters}人 → 世界要素 {m.world_entities}件 → プロット {m.plots}件 → 伏線 {m.foreshadowings}件</p><p>グラフ全体：{m.graph_nodes} nodes / {m.graph_edges} edges</p></div>
          <div className="twinCard"><h3>執筆進捗</h3><div className="progress"><i style={{ width: `${h.episode_coverage}%` }} /></div><p>本文カバレッジ {h.episode_coverage}%</p><p>未解決：HIGH {t.continuity.high} / MEDIUM {t.continuity.medium} / LOW {t.continuity.low}</p></div>
          <div className="twinCard"><h3>アクティブなプロット</h3>{t.active_plots.slice(0, 6).map((x: any) => <div className="twinRow" key={x.id}><b>{x.title}</b><span>{x.start_episode ?? "?"}–{x.end_episode ?? "?"}</span></div>)}</div>
          <div className="twinCard"><h3>未回収の伏線</h3>{t.open_foreshadowings.slice(0, 6).map((x: any) => <div className="twinRow" key={x.id}><b>{x.title}</b><span>設置 EP.{x.setup_episode ?? "?"}</span></div>)}</div>
        </div>
      )}
      {tab === "characters" && <><GraphMini graph={t.characters} /><RelationEditor projectId={projectId} cfg={characterRelationConfig} onChanged={load} /></>}
      {tab === "world" && <><GraphMini graph={t.world} /><RelationEditor projectId={projectId} cfg={worldRelationConfig} onChanged={load} /></>}
      {tab === "timeline" && <GraphMini graph={t.timeline} timeline />}
      {tab === "states" && <div className="stateTable">{t.recent_states.length === 0 ? <p>キャラクター状態履歴はまだありません。</p> : t.recent_states.map((x: any) => <div className="stateRow" key={x.id}><b>EP.{x.episode_number}</b><strong>#{x.character_id}</strong><span>{x.status || "—"}</span><span>{x.location || "—"}</span><span>{x.emotion || "—"}</span><p>{x.notes || "—"}</p></div>)}</div>}
      {tab === "wordcount" && <WordCountSection projectId={projectId} />}
      {tab === "continuity" && <ContinuitySection projectId={projectId} />}
    </div>
  );
}
