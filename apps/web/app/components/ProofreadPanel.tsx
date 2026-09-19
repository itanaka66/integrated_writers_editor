"use client";
import { useEffect, useRef, useState } from "react";
import { streamSSE } from "../lib/api";

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
  const [loading, setLoading] = useState(true);
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
          setError(gotError || "校正に失敗しました。");
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
        <h1>文章校正</h1>
        {loading && <p>スタイルガイドと照合しています...</p>}
        {error && <p className="errorNote">{error}</p>}
        {!loading && !error && diffs.length === 0 && <p>スタイルガイドに沿った修正点は見つかりませんでした。</p>}
        {!loading && !error && current && (
          <>
            <p className="searchSource">{index + 1} / {diffs.length}件</p>
            <div className="proofreadDiff">
              <div className="diffChunk diffRemoved"><pre>- {current.original}</pre></div>
              <div className="diffChunk diffAdded"><pre>+ {current.suggested}</pre></div>
            </div>
            {current.reason && <p style={{ color: "#687386", fontSize: 12 }}>{current.reason}</p>}
          </>
        )}
        <div className="modalActions">
          {done || diffs.length === 0 || error ? (
            <button onClick={onClose}>閉じる</button>
          ) : (
            <>
              <button onClick={skipCurrent}>スキップで次に進む</button>
              <button onClick={applyCurrent}>OKで次に進む</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
