"use client";
import { Project } from "../lib/types";

export type Section =
  | "home" | "write" | "plot" | "characters" | "world" | "timeline"
  | "glossary" | "foreshadow" | "analytics" | "search" | "chat" | "autowrite" | "settings";

const NAV: { key: Section; label: string }[] = [
  { key: "home", label: "🏠 作品ホーム" },
  { key: "write", label: "✎ 執筆" },
  { key: "plot", label: "◆ プロット" },
  { key: "characters", label: "♟ キャラクター" },
  { key: "world", label: "◈ 世界観" },
  { key: "timeline", label: "⏱ 年表" },
  { key: "glossary", label: "📖 用語集" },
  { key: "foreshadow", label: "◎ 伏線" },
  { key: "analytics", label: "📊 分析" },
  { key: "search", label: "🔍 検索" },
  { key: "chat", label: "💬 AIチャット" },
  { key: "autowrite", label: "🚀 自動執筆" },
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
