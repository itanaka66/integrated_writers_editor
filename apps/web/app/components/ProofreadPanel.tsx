"use client";
import { useEffect, useRef, useState } from "react";
import { streamSSE } from "../lib/api";
import LlmProgressView from "./LlmProgressView";
import { useT } from "../lib/i18n";

type Diff = { original: string; suggested: string; reason: string };

// Step-through proofreading: streams style-guide-based diffs for one
// episode (a buffered single-response call was observed to sit idle long
// enough to trip an intermediate proxy's timeout — see
// /episodes/{id}/proofread/stream's docstring), then walks the user
// through the result one diff at a time — each is either applied
// (replacing the first remaining occurrence of `original` in a local
// working copy of the content) or skipped, never both at once, so the
// same original text can't be replaced twice if it repeats.
export default function ProofreadPanel({
  episodeId,
  content,
  onApply,
  onClose,
}: {
  episodeId: number;
  content: string;
  onApply: (next: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [received, setReceived] = useState(0);
  const startedAt = useRef(Date.now());
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [index, setIndex] = useState(0);
  const [working, setWorking] = useState(content);
  const [error, setError] = useState("");
  // Snapshot the content at open time, in a ref rather than a dependency —
  // this must check what's on screen right now (including unsaved edits),
  // but must not re-run mid-check if the textarea changes while the panel
  // is still open.
  const checkedContent = useRef(content);

  useEffect(() => {
    let cancelled = false;
    let cancelStream = () => {};
    let attempt = 0;

    function start() {
      setLoading(true);
      setError("");
      let gotError = "";
      let gotDiffs: Diff[] | null = null;
      cancelStream = streamSSE(
        `/episodes/${episodeId}/proofread/stream`,
        (data) => {
          const event = data as { error?: string; done?: boolean; diffs?: Diff[] };
          setReceived((n) => n + 1);
          if (event.error) gotError = event.error;
          if (event.done) gotDiffs = event.diffs || [];
        },
        () => {
          if (cancelled) return;
          if (gotDiffs) { setDiffs(gotDiffs); setLoading(false); return; }
          // No diffs arrived — either a mid-stream error event, or the
          // connection dropped before any event reached us at all. A
          // single silent retry absorbs a one-off connection hiccup
          // without bothering the user with an error that clears itself
          // a moment later.
          if (attempt === 0) { attempt = 1; start(); return; }
          setError(gotError || t("proofread.failed"));
          setLoading(false);
        },
        { content: checkedContent.current },
      );
    }
    start();
    return () => { cancelled = true; cancelStream(); };
  }, [episodeId]);

  const current = diffs[index];
  const done = !loading && !error && index >= diffs.length;

  function finish(finalContent: string) {
    onApply(finalContent);
    onClose();
  }

  function applyCurrent() {
    if (!current) return;
    const next = working.replace(current.original, current.suggested);
    setWorking(next);
    if (index + 1 >= diffs.length) finish(next);
    else setIndex(index + 1);
  }

  function skipCurrent() {
    if (index + 1 >= diffs.length) finish(working);
    else setIndex(index + 1);
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(ev) => ev.stopPropagation()}>
        <h1>{t("proofread.title")}</h1>
        {loading && (
          <LlmProgressView
            label={t("proofread.working")}
            detail={received > 0 ? t("proofread.events", { count: received }) : undefined}
            startedAt={startedAt.current}
          />
        )}
        {error && <p className="errorNote">{error}</p>}
        {!loading && !error && diffs.length === 0 && <p>{t("proofread.none")}</p>}
        {!loading && !error && current && (
          <>
            <p className="searchSource">{t("proofread.progress", { index: index + 1, total: diffs.length })}</p>
            <div className="proofreadDiff">
              <div className="diffChunk diffRemoved"><pre>- {current.original}</pre></div>
              <div className="diffChunk diffAdded"><pre>+ {current.suggested}</pre></div>
            </div>
            {current.reason && <p style={{ color: "#687386", fontSize: 12 }}>{current.reason}</p>}
          </>
        )}
        <div className="modalActions">
          {done || diffs.length === 0 || error ? (
            <button onClick={onClose}>{t("common.close")}</button>
          ) : (
            <>
              <button onClick={skipCurrent}>{t("proofread.skip")}</button>
              <button onClick={applyCurrent}>{t("proofread.ok")}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
