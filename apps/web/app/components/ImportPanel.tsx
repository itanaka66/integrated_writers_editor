"use client";
import { useEffect, useRef, useState } from "react";
import { api, postFile } from "../lib/api";
import { Project } from "../lib/types";
import { ensureNotificationPermission, notify } from "../lib/notify";

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
            latest.status === "completed" ? "インポートが完了しました" : "インポートでエラーが発生しました",
            `${latest.source_filename}${latest.status === "completed" ? `（新規${latest.created_episodes}話・更新${latest.updated_episodes}話）` : `: ${latest.last_message}`}`,
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
        <h1>ファイルからインポート</h1>
        {!job && (
          <>
            <p>なろう形式のテキストファイル（メタ情報＋エピソード区切り付きの本編、または下書きエピソードのみのファイル）から、新しい作品を作成します。</p>
            <label>
              ファイル *
              <input
                ref={fileInput}
                type="file"
                accept=".txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="searchSource">
              取り込み後、各話のRAG索引付け・キャラクター状態の自動抽出・連続性監査を自動実行します（話数が多いと数分かかることがあります）。
            </p>
            <div className="modalActions">
              <button onClick={onCancel}>キャンセル</button>
              <button onClick={start} disabled={busy || !file}>{busy ? "開始中..." : "インポート開始"}</button>
            </div>
          </>
        )}
        {job && (
          <>
            <p><b>{job.source_filename}</b></p>
            <div className="progress"><i style={{ width: `${job.progress_percent}%` }} /></div>
            <p className="searchSource">
              {job.status === "queued" && "キューに追加しました…"}
              {job.status === "running" && `${job.processed_episodes}/${job.total_episodes}話 処理中… ${job.last_message}`}
              {job.status === "completed" && job.last_message}
              {job.status === "error" && `エラー: ${job.last_message}`}
            </p>
            <div className="modalActions">
              {job.status !== "completed" && job.status !== "error" && <button onClick={onCancel}>閉じる（バックグラウンドで続行）</button>}
              {job.status === "error" && <button onClick={onCancel}>閉じる</button>}
              {job.status === "completed" && <button onClick={finish}>作品を開く</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
