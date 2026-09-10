import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatPanel from "./ChatPanel";
import { api, del, post } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}));

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(post).mockReset();
    vi.mocked(del).mockReset();
  });

  it("loads persisted history on mount", async () => {
    vi.mocked(api).mockResolvedValue([
      { id: 1, role: "user", content: "こんにちは" },
      { id: 2, role: "assistant", content: "こんにちは、何をお手伝いしましょうか" },
    ]);
    render(<ChatPanel projectId={1} />);

    await waitFor(() => expect(screen.getByText("こんにちは")).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith("/projects/1/chat");
  });

  it("sending a message appends both the user turn and the assistant reply", async () => {
    vi.mocked(api).mockResolvedValue([]);
    vi.mocked(post).mockResolvedValue([
      { id: 1, role: "user", content: "質問です" },
      { id: 2, role: "assistant", content: "回答です" },
    ]);
    render(<ChatPanel projectId={1} />);
    await waitFor(() => expect(api).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText("質問を入力..."), { target: { value: "質問です" } });
    fireEvent.click(screen.getByText("送信"));

    await waitFor(() => expect(screen.getByText("回答です")).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith("/projects/1/chat", { content: "質問です" });
  });

  it("renders assistant Markdown as HTML instead of raw syntax", async () => {
    // AI replies are Markdown (headings/bold/tables/rules); dumping them as
    // a single plain-text node ran every line together into one unreadable
    // block. This locks in that they render as real elements instead.
    vi.mocked(api).mockResolvedValue([
      { id: 1, role: "assistant", content: "## 見出し\n\n**強調**テキスト\n\n| A | B |\n|---|---|\n| 1 | 2 |" },
    ]);
    render(<ChatPanel projectId={1} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "見出し" })).toBeInTheDocument());
    expect(screen.getByText("強調").tagName).toBe("STRONG");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("clears history after confirmation", async () => {
    vi.mocked(api).mockResolvedValue([{ id: 1, role: "user", content: "hi" }]);
    vi.mocked(del).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ChatPanel projectId={1} />);

    await waitFor(() => expect(screen.getByText("hi")).toBeInTheDocument());
    fireEvent.click(screen.getByText("履歴を削除"));

    await waitFor(() => expect(del).toHaveBeenCalledWith("/projects/1/chat"));
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
  });
});
