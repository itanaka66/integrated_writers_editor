"use client";
import { useEffect, useState } from "react";

// Shared presentation for "the AI is working": what is being processed, a
// progress bar, elapsed seconds, and an optional detail line / cancel button.
// LLM calls have no real percentage, so the bar is indeterminate unless the
// caller passes a genuinely known `progress` (0-100).
export default function LlmProgressView({
  label, detail, progress, startedAt, onCancel,
}: {
  label: string;
  detail?: string;
  progress?: number;
  startedAt: number;
  onCancel?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const determinate = typeof progress === "number";
  return (
    <div className="llmProgress" role="status" aria-live="polite">
      <b className="llmProgressLabel">{label}</b>
      <div
        className={`llmProgressBar${determinate ? "" : " indeterminate"}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? Math.round(progress as number) : undefined}
      >
        <i style={determinate ? { width: `${Math.min(100, Math.max(0, progress as number))}%` } : undefined} />
      </div>
      <div className="llmProgressMeta">
        <span>経過 {elapsed} 秒</span>
        {detail && <span>{detail}</span>}
      </div>
      {onCancel && (
        <div className="modalActions"><button type="button" onClick={onCancel}>キャンセル</button></div>
      )}
    </div>
  );
}
