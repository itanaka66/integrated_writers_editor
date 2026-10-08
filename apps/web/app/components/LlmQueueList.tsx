"use client";

export type LlmJob = {
  id: number; label: string; username: string | null; status: string;
  position: number | null; elapsed_seconds: number; chars: number;
};
export type LlmQueueData = { running: LlmJob[]; queued: LlmJob[]; recent: LlmJob[] };

// Server-side LLM queue as seen by the API: running, waiting and a few just-
// finished jobs. No percentages: LLM calls expose no real progress, so a
// running job gets the animated indeterminate bar, a waiting one a static
// dashed bar, and a finished one a full bar.
function Row({ job, me }: { job: LlmJob; me: string | null }) {
  const mine = !!me && job.username === me;
  const running = job.status === "running";
  const queued = job.status === "queued";
  const badge = running ? "処理中" : queued ? `待機中・${job.position}番目`
    : job.status === "done" ? "完了" : job.status === "cancelled" ? "中断" : "エラー";
  const kind = running ? "running" : queued ? "queued" : job.status === "done" ? "done" : "failed";
  return (
    <li className={`llmQueueRow ${kind}${mine ? " mine" : ""}`} data-testid="llm-queue-row">
      <div className="llmQueueHead">
        <b>{job.label}</b>
        <span className="llmQueueUser">{job.username ? (mine ? `${job.username}（自分）` : job.username) : "—"}</span>
        <span className={`llmQueueBadge ${kind}`}>{badge}</span>
      </div>
      <div
        className={`llmProgressBar llmQueueBar ${kind}${running ? " indeterminate" : ""}`}
        role="progressbar"
        aria-label={`${job.label} ${badge}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={kind === "done" ? 100 : undefined}
      >
        <i />
      </div>
      <div className="llmProgressMeta">
        <span>{queued ? "待機" : "経過"} {Math.floor(job.elapsed_seconds)} 秒</span>
        {job.chars > 0 && <span>{job.chars.toLocaleString()} 文字受信</span>}
      </div>
    </li>
  );
}

export default function LlmQueueList({ data, me, showEmpty }: { data: LlmQueueData | null; me: string | null; showEmpty?: boolean }) {
  const rows = data ? [...data.running, ...data.queued, ...data.recent] : [];
  if (rows.length === 0) {
    return showEmpty ? <small>現在、処理中・待機中のAI処理はありません。</small> : null;
  }
  return (
    <ul className="llmQueueList" aria-label="AI処理キュー">
      {rows.map((j) => <Row key={`${j.status}-${j.id}`} job={j} me={me} />)}
    </ul>
  );
}
