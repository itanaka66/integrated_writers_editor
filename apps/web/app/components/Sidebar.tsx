"use client";
import { Project } from "../lib/types";

export type Section = "home" | "write" | "search" | "chat" | "settings";

const NAV: { key: Section; label: string }[] = [
  { key: "home", label: "🏠 プロジェクトホーム" },
  { key: "write", label: "✎ 執筆" },
  { key: "search", label: "🔍 検索" },
  { key: "chat", label: "💬 AIチャット" },
  { key: "settings", label: "⚙ 設定" },
];

export default function Sidebar({ project, section, onSection, onDashboard }: {
  project: Project; section: Section; onSection: (s: Section) => void; onDashboard: () => void;
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
    </aside>
  );
}
