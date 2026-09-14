"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Episode, Project } from "../lib/types";
import { Section } from "./Sidebar";

const ICONS: { key: Section; label: string }[] = [
  { key: "write", label: "✎ 執筆" },
  { key: "materials", label: "🗂 資料" },
  { key: "search", label: "🔍 検索" },
  { key: "chat", label: "💬 AIチャット" },
  { key: "settings", label: "⚙ 設定" },
];

export default function ProjectHome({ project, onSection }: { project: Project; onSection: (s: Section) => void }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  useEffect(() => { api(`/projects/${project.id}/episodes`).then(setEpisodes); }, [project.id]);
  const recent = [...episodes].sort((a, b) => b.number - a.number).slice(0, 5);
  const totalChars = episodes.reduce((sum, e) => sum + (e.content || "").replace(/\s/g, "").length, 0);
  const avgChars = episodes.length ? Math.round(totalChars / episodes.length) : 0;

  return (
    <div className="panel projectHome">
      <div className="projectHomeHead">
        <div><h1>{project.name}</h1><p>{project.description || "説明未設定"}</p></div>
      </div>
      <div className="progressStats">
        <div><small>記事数</small><b>{episodes.length}</b></div>
        <div><small>合計文字数</small><b>{totalChars.toLocaleString()}</b></div>
        <div><small>平均文字数</small><b>{avgChars.toLocaleString()}</b></div>
      </div>
      <div className="iconGrid">
        {ICONS.map((x) => <button key={x.key} className="iconGridItem" onClick={() => onSection(x.key)}>{x.label}</button>)}
      </div>
      <div className="card">
        <small>最近の更新</small>
        {recent.length === 0 ? <p>まだ記事がありません。「執筆」から書き始めましょう。</p> :
          recent.map((e) => <div className="twinRow" key={e.id}><b>{e.title}</b><span>{(e.summary || "").slice(0, 40) || "概要未設定"}</span></div>)}
      </div>
    </div>
  );
}
