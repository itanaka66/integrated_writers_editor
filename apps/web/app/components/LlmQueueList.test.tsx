import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: vi.fn(),
}));
import { api } from "../lib/api";
import { LlmActivityProvider, LlmQueueButton, useLlmActivity, LlmActivityHandle } from "../lib/llmActivity";

const job = (o: Record<string, unknown>) => ({ username: "other", position: null, elapsed_seconds: 3, chars: 0, ...o });
const QUEUE = {
  running: [job({ id: 1, label: "文章校正", username: "tanaka", status: "running", chars: 1234 })],
  queued: [job({ id: 2, label: "要約", username: "other", status: "queued", position: 1 }), job({ id: 3, label: "AIチャット", status: "queued", position: 2 })],
  recent: [job({ id: 0, label: "続きを書く", username: "tanaka", status: "done" })],
};

let handle: LlmActivityHandle | null = null;
function Starter() {
  const llm = useLlmActivity();
  return <button onClick={() => { handle = llm.begin("処理中", {}); }}>start</button>;
}

function mockApi(queue: unknown = QUEUE) {
  vi.mocked(api).mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve({ username: "tanaka" });
    if (path === "/llm/queue") return Promise.resolve(queue);
    return Promise.resolve(undefined);
  });
}
const queueCalls = () => vi.mocked(api).mock.calls.filter((c) => c[0] === "/llm/queue").length;

describe("LLM queue list", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(api).mockReset(); handle = null; });
  afterEach(() => { vi.useRealTimers(); });

  it("renders running / queued / recent rows with badges, positions and my-vs-others styling", async () => {
    mockApi();
    render(<LlmActivityProvider><Starter /></LlmActivityProvider>);
    fireEvent.click(screen.getByText("start"));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });

    const rows = screen.getAllByTestId("llm-queue-row");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("文章校正");
    expect(rows[0]).toHaveTextContent("処理中");
    expect(rows[0]).toHaveTextContent("1,234 文字受信");
    expect(rows[0].className).toContain("mine");
    expect(rows[0]).toHaveTextContent("tanaka（自分）");
    expect(rows[0].querySelector(".indeterminate")).not.toBeNull();
    expect(rows[1]).toHaveTextContent("待機中・1番目");
    expect(rows[1].className).not.toContain("mine");
    expect(rows[1].querySelector(".indeterminate")).toBeNull();
    expect(rows[2]).toHaveTextContent("待機中・2番目");
    expect(rows[3]).toHaveTextContent("完了");
    expect(rows[3].querySelector("[aria-valuenow='100']")).not.toBeNull();
  });

  it("polls only while an activity is active and stops when it ends", async () => {
    mockApi();
    render(<LlmActivityProvider><Starter /></LlmActivityProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(queueCalls()).toBe(0);

    fireEvent.click(screen.getByText("start"));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    const during = queueCalls();
    expect(during).toBeGreaterThanOrEqual(3);

    act(() => handle!.end());
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(queueCalls()).toBe(during);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from the sidebar button, shows the empty message, polls while open and stops on close", async () => {
    mockApi({ running: [], queued: [], recent: [] });
    render(<LlmActivityProvider><LlmQueueButton /></LlmActivityProvider>);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("📋 AI処理キュー"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByText("現在、処理中・待機中のAI処理はありません。")).toBeInTheDocument();
    expect(queueCalls()).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByText("閉じる"));
    const n = queueCalls();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(queueCalls()).toBe(n);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows no queue rows while the client activity runs against an empty server queue", async () => {
    mockApi({ running: [], queued: [], recent: [] });
    render(<LlmActivityProvider><Starter /></LlmActivityProvider>);
    fireEvent.click(screen.getByText("start"));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.queryAllByTestId("llm-queue-row")).toHaveLength(0);
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });
});
