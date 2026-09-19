import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizableWidth } from "./useResizableWidth";

// jsdom has no PointerEvent constructor with a real clientX, so build a
// plain Event and stamp clientX on afterward — the hook only reads that
// property, not anything else pointer-specific.
function fakePointerEvent(type: string, clientX: number): Event {
  const ev = new Event(type);
  Object.defineProperty(ev, "clientX", { value: clientX });
  return ev;
}

function drag(startX: number, endX: number, startDrag: (ev: any) => void) {
  act(() => startDrag({ clientX: startX, preventDefault: () => {} }));
  act(() => document.dispatchEvent(fakePointerEvent("pointermove", endX)));
  act(() => document.dispatchEvent(fakePointerEvent("pointerup", endX)));
}

describe("useResizableWidth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("grows a left-anchored panel when dragged right, clamped to max", () => {
    const { result } = renderHook(() =>
      useResizableWidth("test-left", { defaultWidth: 200, min: 100, max: 300, direction: "left" }),
    );
    drag(0, 500, result.current.startDrag);
    expect(result.current.width).toBe(300);
  });

  it("shrinks a left-anchored panel when dragged left, clamped to min", () => {
    const { result } = renderHook(() =>
      useResizableWidth("test-left-2", { defaultWidth: 200, min: 100, max: 300, direction: "left" }),
    );
    drag(0, -500, result.current.startDrag);
    expect(result.current.width).toBe(100);
  });

  it("grows a right-anchored panel when dragged left (mirrored)", () => {
    const { result } = renderHook(() =>
      useResizableWidth("test-right", { defaultWidth: 200, min: 100, max: 300, direction: "right" }),
    );
    drag(0, -50, result.current.startDrag);
    expect(result.current.width).toBe(250);
  });

  it("persists the dragged width to localStorage and reloads it", () => {
    const { result } = renderHook(() =>
      useResizableWidth("test-persist", { defaultWidth: 200, min: 100, max: 300, direction: "left" }),
    );
    drag(0, 40, result.current.startDrag);
    expect(result.current.width).toBe(240);
    expect(localStorage.getItem("test-persist")).toBe("240");

    const { result: second } = renderHook(() =>
      useResizableWidth("test-persist", { defaultWidth: 200, min: 100, max: 300, direction: "left" }),
    );
    expect(second.current.width).toBe(240);
  });
});
