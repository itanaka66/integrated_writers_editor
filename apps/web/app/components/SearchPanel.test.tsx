import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";
import { api, post } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  post: vi.fn(),
}));

describe("SearchPanel memo results", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(post).mockReset();
  });

  it("shows memo matches alongside episode matches", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path === "/projects") return Promise.resolve([]);
      if (path.includes("/text-search")) {
        return Promise.resolve({
          matches: [],
          total_matches: 0,
          memo_matches: [{ memo_id: 1, category: "リサーチ", title: "メモ1", count: 1, snippets: ["…森について…"] }],
          total_memo_matches: 1,
        });
      }
      return Promise.resolve({});
    });
    render(<SearchPanel projectId={1} />);

    fireEvent.click(screen.getByText("検索・全置換"));
    fireEvent.change(screen.getByPlaceholderText("検索する文字列"), { target: { value: "森" } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));

    await waitFor(() => expect(screen.getByText("メモ1")).toBeInTheDocument());
    expect(screen.getByText(/メモは置換対象外です/)).toBeInTheDocument();
  });
});
