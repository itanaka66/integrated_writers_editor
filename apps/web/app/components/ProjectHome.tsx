"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Episode, Project } from "../lib/types";
import { Section } from "./Sidebar";
import { MessageKey, useLocale, useT } from "../lib/i18n";

const ICONS: { key: Section; label: MessageKey }[] = [
  { key: "write", label: "nav.write" },
  { key: "materials", label: "nav.materials" },
  { key: "search", label: "nav.search" },
  { key: "chat", label: "nav.chat" },
  { key: "settings", label: "nav.settings" },
];

export default function ProjectHome({ project, onSection }: { project: Project; onSection: (s: Section) => void }) {
  const t = useT();
  const locale = useLocale();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  useEffect(() => { api(`/projects/${project.id}/episodes`).then(setEpisodes).catch(() => {}); }, [project.id]);
  const recent = [...episodes].sort((a, b) => b.number - a.number).slice(0, 5);
  const totalChars = episodes.reduce((sum, e) => sum + (e.content || "").replace(/\s/g, "").length, 0);
  const avgChars = episodes.length ? Math.round(totalChars / episodes.length) : 0;

  return (
    <div className="panel projectHome">
      <div className="projectHomeHead">
        <div><h1>{project.name}</h1><p>{project.description || t("home.noDescription")}</p></div>
      </div>
      <div className="progressStats">
        <div><small>{t("home.episodeCount")}</small><b>{episodes.length}</b></div>
        <div><small>{t("home.totalChars")}</small><b>{totalChars.toLocaleString(locale)}</b></div>
        <div><small>{t("home.avgChars")}</small><b>{avgChars.toLocaleString(locale)}</b></div>
      </div>
      <div className="iconGrid">
        {ICONS.map((x) => <button key={x.key} className="iconGridItem" onClick={() => onSection(x.key)}>{t(x.label)}</button>)}
      </div>
      <div className="card">
        <small>{t("home.recent")}</small>
        {recent.length === 0 ? <p>{t("home.noEpisodes")}</p> :
          recent.map((e) => <div className="twinRow" key={e.id}><b>{e.title}</b><span>{(e.summary || "").slice(0, 40) || t("home.noSummary")}</span></div>)}
      </div>
    </div>
  );
}
