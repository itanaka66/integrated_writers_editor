import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ImportPanel from "./ImportPanel";
import { api, postFile } from "../lib/api";
import { ensureNotificationPermission, notify } from "../lib/notify";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  postFile: vi.fn(),
}));
vi.mock("../lib/notify", () => ({
  ensureNotificationPermission: vi.fn(),
  notify: vi.fn(),
}));

describe("ImportPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(api).mockReset();
    vi.mocked(postFile).mockReset();
    vi.mocked(ensureNotificationPermission).mockReset();
    vi.mocked(notify).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests notification permission and notifies on completion", async () => {
    vi.mocked(postFile).mockResolvedValue({
      id: 1, project_id: null, mode: "writers", source_filename: "writers.txt",
      status: "queued", total_episodes: 0, processed_episodes: 0, created_episodes: 0, updated_episodes: 0,
      last_message: "", progress_percent: 0,
    });
    vi.mocked(api).mockResolvedValue({
      id: 1, project_id: 7, mode: "writers", source_filename: "writers.txt",
      status: "completed", total_episodes: 3, processed_episodes: 3, created_episodes: 3, updated_episodes: 0,
      last_message: "3話を取り込みました", progress_percent: 100,
    });

    const onCancel = vi.fn();
    const onImported = vi.fn();
    render(<ImportPanel onCancel={onCancel} onImported={onImported} />);

    const file = new File(["dummy"], "writers.txt", { type: "text/plain" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await act(async () => { fireEvent.click(screen.getByText("インポート開始")); });

    expect(ensureNotificationPermission).toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(notify).toHaveBeenCalledWith(
      "インポートが完了しました",
      expect.stringContaining("writers.txt"),
    );
  }, 15000);
});
