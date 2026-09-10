"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Project } from "../lib/types";
import NewProjectForm from "./NewProjectForm";
import ImportPanel from "./ImportPanel";

type Twin = { metrics: { episodes: number; continuity_open: number }; health: { score: number; label: string } };

export default function Dashboard({ onOpen }: { onOpen: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [twins, setTwins] = useState<Record<number, Twin>>({});
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(true);

  async function load() {
    setBusy(true);
    try {
      const list: Project[] = await api("/projects");
      setProjects(list);
      const entries = await Promise.all(list.map(async (p) => [p.id, await api(`/projects/${p.id}/story-twin`)] as const));
      setTwins(Object.fromEntries(entries));
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const focus = projects[0];
  const focusTwin = focus ? twins[focus.id] : null;

  return (
    <div className="dashboard">
      <header className="dashboardHeader">
        <div><small>DASHBOARD</small><h1>こんにちは、ユーザーさん</h1></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowImport(true)}>ファイルからインポート</button>
          <button className="add" onClick={() => setShowNew(true)}>＋ 新規作品作成</button>
        </div>
      </header>
      {busy && projects.length === 0 ? <p className="loading">読み込み中...</p> : null}
      <div className="dashboardGrid">
        <div className="dashboardWorks">
          <small>マイ作品</small>
          {projects.length === 0 && !busy && <div className="card"><b>まだ作品がありません</b><p>「新規作品作成」から最初の作品を作りましょう。</p></div>}
          {projects.map((p) => {
            const goal = p.episode_goal || 500;
            const eps = twins[p.id]?.metrics.episodes ?? 0;
            const pct = Math.min(100, Math.round((eps / goal) * 100));
            return (
              <div className="workCard" key={p.id} onClick={() => onOpen(p)}>
                <div className="workCardHead"><b>{p.name}</b><span>{p.genre || "未設定"}</span></div>
                <div className="progress"><i style={{ width: `${pct}%` }} /></div>
                <div className="workCardFoot"><span>進捗 {pct}%</span><span>({eps}/{goal}話)</span></div>
              </div>
            );
          })}
        </div>
        {focus && focusTwin && (
          <div className="dashboardStats card">
            <small>執筆状況（{focus.name}）</small>
            <div className="dashboardDonutRow">
              <div className={`health ${focusTwin.health.label}`}><b>{Math.min(100, Math.round((focusTwin.metrics.episodes / (focus.episode_goal || 500)) * 100))}%</b><span>執筆状況</span></div>
              <div className="dashboardStatList">
                <div><small>総話数</small><b>{focusTwin.metrics.episodes} / {focus.episode_goal || 500}</b></div>
                <div><small>未解決の連続性課題</small><b>{focusTwin.metrics.continuity_open}</b></div>
                <div><small>作品健全性スコア</small><b>{focusTwin.health.score}</b></div>
              </div>
            </div>
            <p className="dashboardNote">※ AI利用状況（トークン使用量）の集計は今後実装予定です。</p>
          </div>
        )}
      </div>
      {showNew && <NewProjectForm onCancel={() => setShowNew(false)} onCreated={(p) => { setShowNew(false); onOpen(p); }} />}
      {showImport && <ImportPanel onCancel={() => setShowImport(false)} onImported={(p) => { setShowImport(false); onOpen(p); }} />}
    </div>
  );
}
