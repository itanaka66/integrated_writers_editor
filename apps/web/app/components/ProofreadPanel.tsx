"use client";
import { useEffect, useRef, useState } from "react";
import { post } from "../lib/api";

type Diff = { original: string; suggested: string; reason: string };

// Step-through proofreading: fetches style-guide-based diffs for one
// episode, then walks the user through them one at a time — each diff is
// either applied (replacing the first remaining occurrence of `original`
// in a local working copy of the content) or skipped, never both at once,
// so the same original text can't be replaced twice if it repeats.
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
    // A cold Cloudflare Tunnel/proxy connection right after a deploy has
    // been observed to drop the very first request through it, well before
    // this ever reaches the app; one silent retry absorbs that one-off
    // without bothering the user with an error for something that
    // succeeds a moment later on its own. Loading stays shown across both
    // attempts — only a second failure surfaces as an error.
    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r: { diffs: Diff[] } = await post(`/episodes/${episodeId}/proofread`, { content: checkedContent.current });
          if (!cancelled) setDiffs(r.diffs);
          break;
        } catch (err) {
          if (cancelled) return;
          if (attempt === 1) setError(err instanceof Error ? err.message : "校正に失敗しました。");
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkedContent
    // is a ref snapshot taken once at open time, intentionally not re-read
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
