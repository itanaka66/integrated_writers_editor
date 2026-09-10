"use client";
import { useEffect, useState } from "react";
import { clearAuth, getAuth, setUnauthorizedHandler } from "./lib/api";
import { Project } from "./lib/types";
import Login from "./components/Login";
import Sidebar, { Section } from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ProjectHome from "./components/ProjectHome";
import WritePanel from "./components/WritePanel";
import { CharacterPanel, WorldPanel, GlossaryPanel, PlotPanel, ForeshadowPanel, TimelinePanel } from "./components/EntityPanels";
import AnalyticsPanel from "./components/AnalyticsPanel";
import SearchPanel from "./components/SearchPanel";
import ChatPanel from "./components/ChatPanel";
import AutoWritePanel from "./components/AutoWritePanel";
import SettingsPanel from "./components/SettingsPanel";

export default function Studio() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => { clearAuth(); setAuthed(false); });
    setAuthed(!!getAuth());
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
        {section === "plot" && <PlotPanel projectId={project.id} />}
        {section === "characters" && <CharacterPanel projectId={project.id} />}
        {section === "world" && <WorldPanel projectId={project.id} />}
        {section === "timeline" && <TimelinePanel projectId={project.id} />}
        {section === "glossary" && <GlossaryPanel projectId={project.id} />}
        {section === "foreshadow" && <ForeshadowPanel projectId={project.id} />}
        {section === "analytics" && <AnalyticsPanel projectId={project.id} />}
        {section === "search" && <SearchPanel projectId={project.id} />}
        {section === "chat" && <ChatPanel projectId={project.id} />}
        {section === "autowrite" && <AutoWritePanel projectId={project.id} />}
        {section === "settings" && <SettingsPanel project={project} onSaved={setProject} />}
      </main>
    </div>
  );
}
