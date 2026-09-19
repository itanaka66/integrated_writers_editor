import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Studio from "./studio";
import { api, getAuth } from "./lib/api";

// Workspace pulls in a large tree of feature panels that aren't relevant
// here — this test only cares about the authed/unauthed/loading decision
// Studio itself makes, so everything downstream is stubbed out.
vi.mock("./lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/api")>()),
  api: vi.fn(),
  getAuth: vi.fn(),
}));
vi.mock("./components/Login", () => ({ default: () => <div>login-screen</div> }));
vi.mock("./components/Dashboard", () => ({ default: () => <div>dashboard-screen</div> }));

describe("Studio auth detection", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(getAuth).mockReset();
  });

  it("shows the dashboard when /auth/me succeeds, even with nothing in localStorage (OAuth2 session)", async () => {
    vi.mocked(getAuth).mockReturnValue(null);
    vi.mocked(api).mockResolvedValue({ username: "alice", is_admin: false, is_active: true, created_at: "2026-01-01" });
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("dashboard-screen")).toBeInTheDocument());
  });

  it("shows the login screen when /auth/me 401s and there is no localStorage auth", async () => {
    vi.mocked(getAuth).mockReturnValue(null);
    vi.mocked(api).mockRejectedValue(new Error("unauthorized"));
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("login-screen")).toBeInTheDocument());
  });

  it("shows the dashboard immediately from localStorage as an optimistic path, for existing Basic Auth users", async () => {
    vi.mocked(getAuth).mockReturnValue({ u: "admin", pw: "pw" });
    vi.mocked(api).mockResolvedValue({ username: "admin", is_admin: true, is_active: true, created_at: "2026-01-01" });
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("dashboard-screen")).toBeInTheDocument());
  });
});
