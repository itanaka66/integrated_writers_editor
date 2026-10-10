"use client";
import { useMemo, useState } from "react";
import { diffLines, Change } from "diff";
import { useT } from "../lib/i18n";

// Line-level diff between two texts. In edit mode, added lines get a
// checkbox (checked by default) so the caller can accept a merge that's
// partly the AI's suggestion and partly the original — "apply" reconstructs
// the final text from: unchanged lines (always kept), removed lines (always
// dropped), added lines (kept only if their checkbox is checked).
export default function DiffView({
  before,
  after,
  readOnly = false,
  onApply,
  onClose,
}: {
  before: string;
  after: string;
  readOnly?: boolean;
  onApply?: (merged: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const parts = useMemo(() => diffLines(before, after), [before, after]);
  const addedIndexes = useMemo(() => parts.map((p, i) => (p.added ? i : -1)).filter((i) => i >= 0), [parts]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set(addedIndexes));

  function toggle(i: number) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function apply() {
    const merged = parts
      .filter((p, i) => !p.removed && (!p.added || accepted.has(i)))
      .map((p) => p.value)
      .join("");
    onApply?.(merged);
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard diffCard" onClick={(ev) => ev.stopPropagation()}>
        <h1>{readOnly ? t("diff.titleReadOnly") : t("diff.title")}</h1>
        {!readOnly && <p className="diffHint">{t("diff.hint")}</p>}
        <div className="diffBody">
          {parts.map((p: Change, i) => {
            const cls = p.added ? "diffAdded" : p.removed ? "diffRemoved" : "diffUnchanged";
            const lines = p.value.replace(/\n$/, "").split("\n");
            return (
              <div className={`diffChunk ${cls}`} key={i}>
                {!readOnly && p.added && (
                  <label className="diffCheckbox">
                    <input type="checkbox" checked={accepted.has(i)} onChange={() => toggle(i)} />
                    <span>{t("diff.applyChange")}</span>
                  </label>
                )}
                {lines.map((line, j) => (
                  <pre key={j}>{(p.added ? "+ " : p.removed ? "- " : "  ") + line}</pre>
                ))}
              </div>
            );
          })}
        </div>
        <div className="modalActions">
          <button onClick={onClose}>{readOnly ? t("common.close") : t("common.cancel")}</button>
          {!readOnly && <button onClick={apply}>{t("diff.apply")}</button>}
        </div>
      </div>
    </div>
  );
}
