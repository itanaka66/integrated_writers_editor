import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharacterPanel } from "./EntityPanels";
import { api, post, put, del } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

describe("CharacterPanel (generic EntityPanel)", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(post).mockReset();
    vi.mocked(put).mockReset();
    vi.mocked(del).mockReset();
  });

  it("loads and renders the character list", async () => {
    vi.mocked(api).mockResolvedValue([{ id: 1, name: "田中", role: "主人公", personality: "慎重" }]);
    render(<CharacterPanel projectId={1} />);

    await waitFor(() => expect(screen.getByText("田中")).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith("/projects/1/characters");
  });

  it("creating a new character sends every field's default, not just the ones shown as inputs", async () => {
    vi.mocked(api).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 2, name: "リナ", status: "alive" }]);
    vi.mocked(post).mockResolvedValue({});
    render(<CharacterPanel projectId={1} />);

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("＋ 追加"));
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "リナ" } });
    fireEvent.click(screen.getByText("作成"));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [path, body] = vi.mocked(post).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/projects/1/characters");
    expect(body.name).toBe("リナ");
    // "status" isn't a value the create form leaves blank — it's a select
    // pre-filled from cfg.defaults, exactly the mechanism that silently
    // dropped GlossaryPanel's hidden entity_type default before this was
    // fixed to seed from cfg.defaults regardless of which fields render.
    expect(body.status).toBe("alive");
  });

  it("deletes a character after confirmation", async () => {
    vi.mocked(api).mockResolvedValueOnce([{ id: 1, name: "田中" }]).mockResolvedValueOnce([]);
    vi.mocked(del).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CharacterPanel projectId={1} />);

    await waitFor(() => expect(screen.getByText("田中")).toBeInTheDocument());
    fireEvent.click(screen.getByText("削除"));

    await waitFor(() => expect(del).toHaveBeenCalledWith("/characters/1"));
  });

  it("does not delete when the confirmation is declined", async () => {
    vi.mocked(api).mockResolvedValue([{ id: 1, name: "田中" }]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CharacterPanel projectId={1} />);

    await waitFor(() => expect(screen.getByText("田中")).toBeInTheDocument());
    fireEvent.click(screen.getByText("削除"));

    expect(del).not.toHaveBeenCalled();
  });
});
