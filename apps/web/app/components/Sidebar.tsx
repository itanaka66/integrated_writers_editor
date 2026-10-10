"use client";
import { ReactNode } from "react";
import { Project } from "../lib/types";
import { clearAuth } from "../lib/api";
import { LlmQueueButton } from "../lib/llmActivity";
import { MessageKey, useT } from "../lib/i18n";

export type Section = "home" | "write" | "materials" | "search" | "chat" | "settings";

const NAV: { key: Section; label: MessageKey }[] = [
  { key: "home", label: "nav.home" },
  { key: "write", label: "nav.write" },
  { key: "materials", label: "nav.materials" },
  { key: "search", label: "nav.search" },
  { key: "chat", label: "nav.chat" },
  { key: "settings", label: "nav.settings" },
];

export default function Sidebar({ project, section, onSection, onDashboard, resizer }: {
  project: Project; section: Section; onSection: (s: Section) => void; onDashboard: () => void; resizer?: ReactNode;
}) {
  const t = useT();
  return (
    <aside className="appSidebar">
      <div className="appSidebarBrand" title="Integrated writers Editor">✦ INE</div>
      <button className="appSidebarDashboard" onClick={onDashboard}>{t("sidebar.toDashboard")}</button>
      <div className="appSidebarProject"><small>PROJECT</small><b>{project.name}</b></div>
      <div className="appSidebarNav">
        {NAV.map((n) => (
          <button key={n.key} className={section === n.key ? "nav active" : "nav"} onClick={() => onSection(n.key)}>{t(n.label)}</button>
        ))}
      </div>
      <LlmQueueButton />
      <button className="appSidebarLogout" onClick={() => { clearAuth(); window.location.reload(); }}>{t("sidebar.logout")}</button>
      {resizer}
    </aside>
  );
}
