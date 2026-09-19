import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WritePanel from "./WritePanel";
import { api, post, put, del, streamSSE } from "../lib/api";
import { Project } from "../lib/types";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  streamSSE: vi.fn(),
}));

const project: Project = { id: 1, name: "P", description: "", genre: "", rules: "", style_guide: "" };
const episode = { id: 10, project_id: 1, number: 1, title: "第一記事", summary: "", content: "本文", updated_at: "" };

// Simulates the backend's SSE stream by immediately delivering the given
// deltas (synchronously, via the onMessage callback) as if the whole
// response arrived in one chunk.
function mockStream(fullText: string) {
  vi.mocked(streamSSE).mockImplementation((_path, onMessage, onDone) => {
    onMessage({ delta: fullText });
    onMessage({ done: true, model: "stub-model" });
    onDone?.();
    return () => {};
  });
}

describe("WritePanel", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(post).mockReset();
    vi.mocked(put).mockReset();
    vi.mocked(del).mockReset();
    vi.mocked(streamSSE).mockReset();
  });

  it("opens the AI tool picker and runs a direct tool", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.includes("/episodes")) return Promise.resolve([episode]);
      if (path.includes("/sources")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockStream("AI結果");
    render(<WritePanel project={project} />);

    await waitFor(() => expect(screen.getByText("🛠 AIツール")).toBeInTheDocument());
    fireEvent.click(screen.getByText("🛠 AIツール"));
    fireEvent.click(screen.getByText("✎ 文章を改善"));

    await waitFor(() => expect(screen.getByText("AI結果")).toBeInTheDocument());
    const call = vi.mocked(streamSSE).mock.calls[0];
    expect(call[0]).toBe("/ai/generate/stream");
    expect(call[3]).toEqual(expect.objectContaining({ mode: "custom", episode_id: episode.id }));
  });

  it("runs a choice-based tool with the selected option embedded in the prompt", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.includes("/episodes")) return Promise.resolve([episode]);
      if (path.includes("/sources")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockStream("SNS向け原稿");
    render(<WritePanel project={project} />);

    await waitFor(() => expect(screen.getByText("🛠 AIツール")).toBeInTheDocument());
    fireEvent.click(screen.getByText("🛠 AIツール"));
    fireEvent.click(screen.getByText("🔁 複数媒体への変換"));
    fireEvent.click(screen.getByText("SNS投稿"));

    await waitFor(() => expect(screen.getByText("SNS向け原稿")).toBeInTheDocument());
    const call = vi.mocked(streamSSE).mock.calls[0];
    expect((call[3] as { instruction: string }).instruction).toContain("SNS投稿");
  });

  it("adds a source for the current article", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.includes("/episodes")) return Promise.resolve([episode]);
      if (path.includes("/sources")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(post).mockResolvedValue({});
    render(<WritePanel project={project} />);

    await waitFor(() => expect(screen.getByText(/出典/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/📚 出典/));
    fireEvent.change(screen.getByPlaceholderText("出典タイトル *"), { target: { value: "参考記事" } });
    fireEvent.click(screen.getByText("＋ 出典を追加"));

    await waitFor(() => expect(post).toHaveBeenCalledWith(`/episodes/${episode.id}/sources`, expect.objectContaining({ title: "参考記事" })));
  });

  it("walks through proofread diffs one at a time and applies the accepted ones", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.includes("/episodes")) return Promise.resolve([episode]);
      if (path.includes("/sources")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(post).mockImplementation((path: string) => {
      if (path.includes("/proofread")) {
        return Promise.resolve({
          diffs: [
            { original: "本文", suggested: "改訂後の本文", reason: "である調に統一" },
            { original: "見つからない文字列", suggested: "x", reason: "適用されないはず" },
          ],
        });
      }
      return Promise.resolve({});
    });
    render(<WritePanel project={project} />);

    await waitFor(() => expect(screen.getByText("📐 文章校正")).toBeInTheDocument());
    fireEvent.click(screen.getByText("📐 文章校正"));

    await waitFor(() => expect(screen.getByText("1 / 2件")).toBeInTheDocument());
    fireEvent.click(screen.getByText("OKで次に進む"));

    await waitFor(() => expect(screen.getByText("2 / 2件")).toBeInTheDocument());
    fireEvent.click(screen.getByText("スキップで次に進む"));

    await waitFor(() => expect(screen.queryByText("文章校正")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("改訂後の本文")).toBeInTheDocument();
  });

  it("opens the same proofread panel from the AI EDITOR sidebar's 校正 shortcut", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.includes("/episodes")) return Promise.resolve([episode]);
      if (path.includes("/sources")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(post).mockResolvedValue({ diffs: [] });
    render(<WritePanel project={project} />);

    await waitFor(() => expect(screen.getByText("校正")).toBeInTheDocument());
    fireEvent.click(screen.getByText("校正"));

    await waitFor(() => expect(screen.getByRole("heading", { name: "文章校正" })).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith(`/episodes/${episode.id}/proofread`, {});
  });

  it("copies the content to the clipboard for pasting into Word", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.includes("/episodes")) return Promise.resolve([episode]);
      if (path.includes("/sources")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<WritePanel project={project} />);

    await waitFor(() => expect(screen.getByText("📋 Wordにコピー")).toBeInTheDocument());
    fireEvent.click(screen.getByText("📋 Wordにコピー"));

    // jsdom has no ClipboardItem, so this exercises the plain-text fallback
    // path — the rich text/html path is gated behind a runtime feature
    // check that's simply unavailable in this test environment.
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(episode.content));
    await waitFor(() => expect(screen.getByText(/コピーしました/)).toBeInTheDocument());
  });
});
