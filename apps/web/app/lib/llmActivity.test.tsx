import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LlmActivityProvider, useLlmActivity, LlmActivityHandle } from "./llmActivity";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  api: vi.fn(() => Promise.resolve(undefined)),
}));

let handle: LlmActivityHandle | null = null;
function Starter({ cancel }: { cancel?: () => void }) {
  const llm = useLlmActivity();
  return <button onClick={() => { handle = llm.begin("文章校正をAIが実行中です…", { cancel }); }}>start</button>;
}

describe("LlmActivityProvider", () => {
  it("shows label, indeterminate bar and elapsed text, updates detail, and hides on end()", () => {
    render(<LlmActivityProvider><Starter /></LlmActivityProvider>);
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByText("start"));
    expect(screen.getByText("文章校正をAIが実行中です…", { selector: "b" })).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar.className).toContain("indeterminate");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText(/経過 \d+ 秒/)).toBeInTheDocument();
    expect(screen.queryByText("キャンセル")).toBeNull();

    act(() => handle!.update({ detail: "1,234 文字受信" }));
    expect(screen.getByText("1,234 文字受信")).toBeInTheDocument();

    act(() => handle!.update({ progress: 40 }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");

    act(() => handle!.end());
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("calls the abort function when Cancel is clicked", () => {
    const cancel = vi.fn();
    render(<LlmActivityProvider><Starter cancel={cancel} /></LlmActivityProvider>);
    fireEvent.click(screen.getByText("start"));
    fireEvent.click(screen.getByText("キャンセル"));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
