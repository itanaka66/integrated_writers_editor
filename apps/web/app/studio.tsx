"use client";
import { useEffect, useState } from "react";
import { api, clearAuth, getAuth, setUnauthorizedHandler } from "./lib/api";
import { Project } from "./lib/types";
import Login from "./components/Login";
import Sidebar, { Section } from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ProjectHome from "./components/ProjectHome";
import WritePanel from "./components/WritePanel";
import MaterialsPanel from "./components/MaterialsPanel";
import SearchPanel from "./components/SearchPanel";
import ChatPanel from "./components/ChatPanel";
import SettingsPanel from "./components/SettingsPanel";

export default function Studio() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => { clearAuth(); setAuthed(false); });
    // localStorage creds are the fast, common-case path for existing Basic
    // Auth users, but the real source of truth is now "did an authenticated
    // request succeed" — an OAuth2 login has nothing in localStorage at
    // all, only a session cookie, so it can only be detected by asking the
    // API. /auth/me is the cheapest authenticated call that does that.
    if (getAuth()) setAuthed(true);
    api("/auth/me")
      .then(() => setAuthed(true))
      .catch(() => setAuthed((prev) => (prev ? prev : false)));
    return () => setUnauthorizedHandler(null);
  }, []);

  if (authed === null) return <div className="center">確認中...</div>;
  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;
  return <Workspace />;
}

function Workspace() {
  const [project, setProject] = useState<Project | null>(null);
  const [section, setSection] = useState<Section>("home");

  if (!project) return <Dashboard onOpen={(p) => { setProject(p); setSection("home"); }} />;

  return (
    <div className="appShell">
      <Sidebar project={project} section={section} onSection={setSection} onDashboard={() => setProject(null)} />
      <main className="appMain">
        {section === "home" && <ProjectHome project={project} onSection={setSection} />}
        {section === "write" && <WritePanel project={project} />}
        {section === "materials" && <MaterialsPanel projectId={project.id} />}
        {section === "search" && <SearchPanel projectId={project.id} />}
        {section === "chat" && <ChatPanel projectId={project.id} />}
        {section === "settings" && <SettingsPanel project={project} onSaved={setProject} />}
      </main>
    </div>
  );
}
