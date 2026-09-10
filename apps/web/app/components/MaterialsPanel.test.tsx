import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MaterialsPanel from "./MaterialsPanel";
import { api, post, postForm, del } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  post: vi.fn(),
  postForm: vi.fn(),
  del: vi.fn(),
}));

describe("MaterialsPanel", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(post).mockReset();
    vi.mocked(postForm).mockReset();
    vi.mocked(del).mockReset();
  });

  it("runs a research query and shows the AI result", async () => {
    vi.mocked(api).mockResolvedValue([]);
    vi.mocked(post).mockResolvedValue({ text: "リサーチ結果です" });
    render(<MaterialsPanel projectId={1} />);

    fireEvent.change(screen.getByPlaceholderText("例）2024年のSEOトレンド"), { target: { value: "テーマA" } });
    fireEvent.click(screen.getByText("リサーチする"));

    await waitFor(() => expect(screen.getByText("リサーチ結果です")).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith("/ai/generate", expect.objectContaining({ project_id: 1, mode: "custom" }));
  });

  it("summarizes pasted text via the material-summarize endpoint", async () => {
    vi.mocked(api).mockResolvedValue([]);
    vi.mocked(postForm).mockResolvedValue({ summary: "要約結果です" });
    render(<MaterialsPanel projectId={1} />);

    fireEvent.click(screen.getByText("📄 資料要約"));
    fireEvent.change(screen.getByPlaceholderText("Web記事・社内資料の本文を貼り付けてください"), { target: { value: "資料本文" } });
    fireEvent.click(screen.getByText("要約する"));

    await waitFor(() => expect(screen.getByText("要約結果です")).toBeInTheDocument());
    expect(postForm).toHaveBeenCalledWith("/tools/summarize-material", { text: "資料本文" });
  });

  it("adds and removes a memo", async () => {
    vi.mocked(api).mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 1, project_id: 1, category: "リサーチ", title: "タイトル", content: "内容", created_at: "" },
    ]);
    vi.mocked(post).mockResolvedValue({});
    render(<MaterialsPanel projectId={1} />);

    fireEvent.click(screen.getByText("🗒 メモ"));
    fireEvent.change(screen.getByPlaceholderText("メモ内容"), { target: { value: "内容" } });
    fireEvent.click(screen.getByText("＋ メモを追加"));

    await waitFor(() => expect(screen.getByText("内容")).toBeInTheDocument());

    vi.mocked(del).mockResolvedValue(undefined);
    vi.mocked(api).mockResolvedValueOnce([]);
    fireEvent.click(screen.getByText("削除"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/memos/1"));
  });
});
