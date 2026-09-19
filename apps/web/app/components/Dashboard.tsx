"use client";
import { useEffect, useState } from "react";
import { api, ApiError, clearAuth, oauthUrl } from "../lib/api";
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
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("ログイン試行の失敗が続いたため、一時的にアクセスがロックされています。しばらく待ってから再度お試しください。");
      } else {
        setError("プロジェクトの読み込みに失敗しました。APIに接続できないか、CORS_ORIGINSの設定に問題がある可能性があります。");
      }
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function logout() {
    clearAuth();
    // Also clears the OAuth2 session cookie (see apps/api/app/main.py) —
    // harmless no-op for a Basic-Auth-only user who never had one, but
    // required for an OAuth-only user, who has nothing in localStorage to
    // clear in the first place.
    try {
      await fetch(oauthUrl("/logout"), { credentials: "include" });
    } catch {
      /* best-effort; localStorage is already cleared either way */
    }
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
            const eps = counts[p.id] ?? 0;
            return (
              <div className="workCard" key={p.id} onClick={() => onOpen(p)}>
                <div className="workCardHead"><b>{p.name}</b></div>
                <div className="workCardFoot"><span>{eps}記事</span></div>
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
