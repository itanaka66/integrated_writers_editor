"use client";
import { useEffect, useState } from "react";
import { api, clearAuth } from "../lib/api";
import { Episode, Project } from "../lib/types";
import NewProjectForm from "./NewProjectForm";
import ImportPanel from "./ImportPanel";

export default function Dashboard({ onOpen }: { onOpen: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const list: Project[] = await api("/projects");
      setProjects(list);
      const entries = await Promise.all(list.map(async (p) => {
        const eps: Episode[] = await api(`/projects/${p.id}/episodes`);
        return [p.id, eps.length] as const;
      }));
      setCounts(Object.fromEntries(entries));
    } catch {
      setError("プロジェクトの読み込みに失敗しました。APIに接続できないか、CORS_ORIGINSの設定に問題がある可能性があります。");
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  function logout() {
    clearAuth();
    window.location.reload();
  }

  return (
    <div className="dashboard">
      <header className="dashboardHeader">
        <div><small>DASHBOARD</small><h1>こんにちは、ユーザーさん</h1></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowImport(true)}>ファイルからインポート</button>
          <button className="add" onClick={() => setShowNew(true)}>＋ 新規プロジェクト作成</button>
          <button onClick={logout}>ログアウト</button>
        </div>
      </header>
      {error && <div className="loginError">{error}</div>}
      {busy && projects.length === 0 ? <p className="loading">読み込み中...</p> : null}
      <div className="dashboardGrid">
        <div className="dashboardWorks">
          <small>マイプロジェクト</small>
          {projects.length === 0 && !busy && <div className="card"><b>まだプロジェクトがありません</b><p>「新規プロジェクト作成」から最初のプロジェクトを作りましょう。</p></div>}
          {projects.map((p) => {
            const goal = p.episode_goal || 500;
            const eps = counts[p.id] ?? 0;
            const pct = Math.min(100, Math.round((eps / goal) * 100));
            return (
              <div className="workCard" key={p.id} onClick={() => onOpen(p)}>
                <div className="workCardHead"><b>{p.name}</b></div>
                <div className="progress"><i style={{ width: `${pct}%` }} /></div>
                <div className="workCardFoot"><span>進捗 {pct}%</span><span>({eps}/{goal}記事)</span></div>
              </div>
            );
          })}
        </div>
      </div>
      {showNew && <NewProjectForm onCancel={() => setShowNew(false)} onCreated={(p) => { setShowNew(false); onOpen(p); }} />}
      {showImport && <ImportPanel onCancel={() => setShowImport(false)} onImported={(p) => { setShowImport(false); onOpen(p); }} />}
    </div>
  );
}
