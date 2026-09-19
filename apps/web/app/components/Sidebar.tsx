"use client";
import { ReactNode } from "react";
import { Project } from "../lib/types";
import { clearAuth } from "../lib/api";

export type Section = "home" | "write" | "materials" | "search" | "chat" | "settings";

const NAV: { key: Section; label: string }[] = [
  { key: "home", label: "🏠 プロジェクトホーム" },
  { key: "write", label: "✎ 執筆" },
  { key: "materials", label: "🗂 資料" },
  { key: "search", label: "🔍 検索" },
  { key: "chat", label: "💬 AIチャット" },
  { key: "settings", label: "⚙ 設定" },
];

export default function Sidebar({ project, section, onSection, onDashboard, resizer }: {
  project: Project; section: Section; onSection: (s: Section) => void; onDashboard: () => void; resizer?: ReactNode;
}) {
  return (
    <aside className="appSidebar">
      <div className="appSidebarBrand" title="Integrated writers Editor">✦ INE</div>
      <button className="appSidebarDashboard" onClick={onDashboard}>← ダッシュボードへ</button>
      <div className="appSidebarProject"><small>PROJECT</small><b>{project.name}</b></div>
      <div className="appSidebarNav">
        {NAV.map((n) => (
          <button key={n.key} className={section === n.key ? "nav active" : "nav"} onClick={() => onSection(n.key)}>{n.label}</button>
        ))}
      </div>
      <button className="appSidebarLogout" onClick={() => { clearAuth(); window.location.reload(); }}>⏻ ログアウト</button>
      {resizer}
    </aside>
  );
}
