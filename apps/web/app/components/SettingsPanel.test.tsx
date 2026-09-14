import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsPanel from "./SettingsPanel";
import { api, put } from "../lib/api";
import { Project } from "../lib/types";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  post: vi.fn(),
  postFile: vi.fn(),
  put: vi.fn(),
  downloadFile: vi.fn(),
}));

const project: Project = { id: 1, name: "P", description: "", genre: "", rules: "", style_guide: "" };

const systemSettings = {
  database_url_masked: "writers:***@db:5432/writers",
  qdrant_url: "http://qdrant:6333", qdrant_url_is_override: false,
  ollama_url: "http://ollama:11434", ollama_url_is_override: false,
  ollama_model: "qwen3.8:27b", ollama_model_is_override: false,
  ollama_embed_model: "nomic-embed-text", ollama_embed_model_is_override: false,
  ai_provider: "ollama",
  anthropic_api_key_is_set: false, anthropic_model: "claude-sonnet-4-5",
  openai_api_key_is_set: false, openai_model: "gpt-4o-mini",
  google_api_key_is_set: false, google_model: "gemini-2.0-flash",
  cors_origins: "http://localhost:3000", cors_origins_is_override: false,
};

describe("SettingsPanel AI provider section", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(put).mockReset();
  });

  it("loads the current provider and shows it selected", async () => {
    vi.mocked(api).mockResolvedValue(systemSettings);
    render(<SettingsPanel project={project} onSaved={() => {}} />);

    fireEvent.click(screen.getByText("接続設定"));
    await waitFor(() => expect(screen.getByText(/使用するAIプロバイダー/)).toBeInTheDocument());

    const select = screen.getByRole("combobox", { name: /使用するAIプロバイダー/ }) as HTMLSelectElement;
    expect(select.value).toBe("ollama");
  });

  it("saving without typing a new API key does not send the key field (avoids wiping a stored key)", async () => {
    vi.mocked(api).mockResolvedValue({ ...systemSettings, ai_provider: "anthropic", anthropic_api_key_is_set: true });
    vi.mocked(put).mockResolvedValue({ ...systemSettings, ai_provider: "anthropic", anthropic_api_key_is_set: true });
    render(<SettingsPanel project={project} onSaved={() => {}} />);

    fireEvent.click(screen.getByText("接続設定"));
    await waitFor(() => expect(screen.getByText(/使用するAIプロバイダー/)).toBeInTheDocument());

    fireEvent.click(screen.getAllByText("保存")[0]);

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = vi.mocked(put).mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("anthropic_api_key");
    expect(body).not.toHaveProperty("openai_api_key");
    expect(body).not.toHaveProperty("google_api_key");
  });

  it("typing a new API key includes it in the save payload", async () => {
    vi.mocked(api).mockResolvedValue(systemSettings);
    vi.mocked(put).mockResolvedValue(systemSettings);
    render(<SettingsPanel project={project} onSaved={() => {}} />);

    fireEvent.click(screen.getByText("接続設定"));
    await waitFor(() => expect(screen.getByPlaceholderText("sk-ant-...")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), { target: { value: "sk-ant-newkey" } });
    fireEvent.click(screen.getAllByText("保存")[0]);

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = vi.mocked(put).mock.calls[0][1] as Record<string, unknown>;
    expect(body.anthropic_api_key).toBe("sk-ant-newkey");
  });
});

describe("SettingsPanel usage tab", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it("shows aggregated usage totals and per-provider rows", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.startsWith("/ai-usage/summary")) {
        return Promise.resolve({
          rows: [{ provider: "anthropic", model: "claude-sonnet-4-5", calls: 3, input_tokens: 1000, output_tokens: 500, estimated_cost_usd: 0.0105 }],
          total_calls: 3, total_input_tokens: 1000, total_output_tokens: 500, total_estimated_cost_usd: 0.0105,
        });
      }
      if (path.startsWith("/ai-usage/recent")) return Promise.resolve([]);
      return Promise.resolve(systemSettings);
    });
    render(<SettingsPanel project={project} onSaved={() => {}} />);

    fireEvent.click(screen.getByText("使用状況"));
    await waitFor(() => expect(screen.getByText("claude-sonnet-4-5")).toBeInTheDocument());
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$0.0105").length).toBeGreaterThan(0);
  });

  it("shows an unknown-cost marker when a model has no pricing entry", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.startsWith("/ai-usage/summary")) {
        return Promise.resolve({
          rows: [{ provider: "anthropic", model: "some-future-model", calls: 1, input_tokens: 10, output_tokens: 10, estimated_cost_usd: null }],
          total_calls: 1, total_input_tokens: 10, total_output_tokens: 10, total_estimated_cost_usd: null,
        });
      }
      if (path.startsWith("/ai-usage/recent")) return Promise.resolve([]);
      return Promise.resolve(systemSettings);
    });
    render(<SettingsPanel project={project} onSaved={() => {}} />);

    fireEvent.click(screen.getByText("使用状況"));
    await waitFor(() => expect(screen.getByText("some-future-model")).toBeInTheDocument());
    expect(screen.getAllByText("不明").length).toBeGreaterThan(0);
  });
});
