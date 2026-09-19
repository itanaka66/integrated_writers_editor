import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Dashboard from "./Dashboard";
import { api } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: vi.fn(),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it("greets the logged-in user by their username", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve({ username: "tanaka", email: null, is_admin: true, is_active: true, created_at: "2026-01-01T00:00:00Z" });
      if (path === "/projects") return Promise.resolve([]);
      return Promise.resolve([]);
    });
    render(<Dashboard onOpen={() => {}} />);

    await waitFor(() => expect(screen.getByText("こんにちは、tanakaさん")).toBeInTheDocument());
  });

  it("falls back to a generic greeting when /auth/me fails", async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.reject(new Error("unauthorized"));
      if (path === "/projects") return Promise.resolve([]);
      return Promise.resolve([]);
    });
    render(<Dashboard onOpen={() => {}} />);

    await waitFor(() => expect(screen.getByText("こんにちは、ユーザーさん")).toBeInTheDocument());
  });
});
