"use client";
import { useEffect, useRef, useState } from "react";
import { api, postFile } from "../lib/api";
import { Project } from "../lib/types";
import { ensureNotificationPermission, notify } from "../lib/notify";
import { useT } from "../lib/i18n";

type ImportJob = {
  id: number;
  project_id: number | null;
  mode: "writers" | "episodes";
  source_filename: string;
  status: "queued" | "running" | "completed" | "error";
  total_episodes: number;
  processed_episodes: number;
  created_episodes: number;
  updated_episodes: number;
  last_message: string;
  progress_percent: number;
};

export default function ImportPanel({ onImported, onCancel }: { onImported: (p: Project) => void; onCancel: () => void }) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function start() {
    if (!file) return;
    setBusy(true);
    ensureNotificationPermission();
    try {
      const j: ImportJob = await postFile("/import/writers", file);
      setJob(j);
      timer.current = setInterval(async () => {
        const latest: ImportJob = await api(`/import-jobs/${j.id}`);
        setJob(latest);
        if (latest.status === "completed" || latest.status === "error") {
          if (timer.current) clearInterval(timer.current);
          notify(
            latest.status === "completed" ? t("import.notifyDone") : t("import.notifyError"),
            `${latest.source_filename}${latest.status === "completed" ? t("import.summaryDone", { created: latest.created_episodes, updated: latest.updated_episodes }) : `: ${latest.last_message}`}`,
          );
        }
      }, 2000);
    } finally { setBusy(false); }
  }

  async function finish() {
    if (!job?.project_id) return;
    const p: Project = await api(`/projects/${job.project_id}`);
    onImported(p);
  }

  return (
    <div className="modalOverlay" onClick={job?.status === "completed" ? undefined : onCancel}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <h1>{t("dashboard.import")}</h1>
        {!job && (
          <>
            <p>{t("import.intro")}</p>
            <label>
              {t("import.file")}
              <input
                ref={fileInput}
                type="file"
                accept=".txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="searchSource">
              {t("import.ragNote")}
            </p>
            <div className="modalActions">
              <button onClick={onCancel}>{t("common.cancel")}</button>
              <button onClick={start} disabled={busy || !file}>{busy ? t("import.starting") : t("import.start")}</button>
            </div>
          </>
        )}
        {job && (
          <>
            <p><b>{job.source_filename}</b></p>
            <div className="progress"><i style={{ width: `${job.progress_percent}%` }} /></div>
            <p className="searchSource">
              {job.status === "queued" && t("import.queued")}
              {job.status === "running" && t("import.running", { processed: job.processed_episodes, total: job.total_episodes, message: job.last_message })}
              {job.status === "completed" && job.last_message}
              {job.status === "error" && t("import.errorPrefix", { message: job.last_message })}
            </p>
            <div className="modalActions">
              {job.status !== "completed" && job.status !== "error" && <button onClick={onCancel}>{t("import.closeBg")}</button>}
              {job.status === "error" && <button onClick={onCancel}>{t("common.close")}</button>}
              {job.status === "completed" && <button onClick={finish}>{t("import.openProject")}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
