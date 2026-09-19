"use client";
import { PointerEvent as ReactPointerEvent } from "react";

// A thin draggable handle placed on the edge of a fixed-width panel (via
// absolute positioning — see .resizer in globals.css), used to resize that
// panel by dragging. `side` says which edge of the *panel* it sits on:
// "right" for a panel anchored to the left of the layout (its right edge
// is what's dragged), "left" for a panel anchored to the right.
export default function Resizer({ side, onPointerDown }: { side: "left" | "right"; onPointerDown: (ev: ReactPointerEvent) => void }) {
  return <div className={`resizer resizer${side === "left" ? "Left" : "Right"}`} onPointerDown={onPointerDown} />;
}
