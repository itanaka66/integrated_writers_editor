"use client";
import { PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from "react";

// Remembers a dragged panel width per-viewer (localStorage) — never read
// back by the server, just a convenience so a resize sticks across
// reloads on the same browser. Wrapped in try/catch since localStorage can
// throw or be unavailable (private browsing, blocked site data, etc.).
function loadStoredWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredWidth(key: string, width: number) {
  try {
    localStorage.setItem(key, String(Math.round(width)));
  } catch {
    /* localStorage unavailable; the resize just won't persist */
  }
}

// `direction: "left"` means the panel's left edge is fixed and its right
// edge is what's being dragged (growing the panel as the pointer moves
// right) — used for a sidebar-style panel on the left of the layout.
// `direction: "right"` is the mirror image, for a panel anchored to the
// right edge of the layout (dragging left grows it).
export function useResizableWidth(
  key: string,
  { defaultWidth, min, max, direction }: { defaultWidth: number; min: number; max: number; direction: "left" | "right" },
) {
  const [width, setWidth] = useState(() => loadStoredWidth(key, defaultWidth));
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerMove = useCallback((ev: PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const delta = ev.clientX - drag.startX;
    const raw = direction === "left" ? drag.startWidth + delta : drag.startWidth - delta;
    setWidth(Math.min(max, Math.max(min, raw)));
  }, [direction, min, max]);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    setWidth((w) => { saveStoredWidth(key, w); return w; });
  }, [key, onPointerMove]);

  const startDrag = useCallback((ev: ReactPointerEvent) => {
    ev.preventDefault();
    dragState.current = { startX: ev.clientX, startWidth: width };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [width, onPointerMove, onPointerUp]);

  return { width, startDrag };
}
