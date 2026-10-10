"use client";
import { useEffect, useState } from "react";
import { api, ApiError, clearAuth, oauthUrl } from "../lib/api";
import { Episode, Project } from "../lib/types";
import NewProjectForm from "./NewProjectForm";
import ImportPanel from "./ImportPanel";
import { useT } from "../lib/i18n";

export default function Dashboard({ onOpen }: { onOpen: (p: Project) => void }) {
  const t = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    api("/auth/me").then((u: { username: string }) => setUsername(u.username)).catch(() => {});
  }, []);

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
        setError(t("dashboard.errorLocked"));
      } else {
        setError(t("dashboard.errorLoad"));
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
        <div><small>DASHBOARD</small><h1>{t("dashboard.greeting", { name: username || t("dashboard.defaultUser") })}</h1></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowImport(true)}>{t("dashboard.import")}</button>
          <button className="add" onClick={() => setShowNew(true)}>{t("dashboard.newProject")}</button>
          <button onClick={logout}>{t("common.logout")}</button>
        </div>
      </header>
      {error && <div className="loginError">{error}</div>}
      {busy && projects.length === 0 ? <p className="loading">{t("common.loading")}</p> : null}
      <div className="dashboardGrid">
        <div className="dashboardWorks">
          <small>{t("dashboard.myProjects")}</small>
          {projects.length === 0 && !busy && <div className="card"><b>{t("dashboard.noProjects")}</b><p>{t("dashboard.noProjectsHint")}</p></div>}
          {projects.map((p) => {
            const eps = counts[p.id] ?? 0;
            return (
              <div className="workCard" key={p.id} onClick={() => onOpen(p)}>
                <div className="workCardHead"><b>{p.name}</b></div>
                <div className="workCardFoot"><span>{t("dashboard.episodeCount", { count: eps })}</span></div>
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
