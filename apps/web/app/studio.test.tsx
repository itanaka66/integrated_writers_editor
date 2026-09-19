import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Studio from "./studio";
import { api, getAuth, post } from "./lib/api";

// Workspace pulls in a large tree of feature panels that aren't relevant
// here — this test only cares about the authed/unauthed/loading decision
// Studio itself makes, so everything downstream is stubbed out.
vi.mock("./lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/api")>()),
  api: vi.fn(),
  getAuth: vi.fn(),
  post: vi.fn(),
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

describe("Studio password-reset screen", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(getAuth).mockReset();
    vi.mocked(post).mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  function setUrl(search: string) {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, search, href: originalLocation.href },
    });
  }

  it("shows the reset screen (not Login/Dashboard) when ?reset_token= is present, even while unauthed", async () => {
    setUrl("?reset_token=abc123");
    vi.mocked(getAuth).mockReturnValue(null);
    vi.mocked(api).mockRejectedValue(new Error("unauthorized"));
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("パスワード再設定")).toBeInTheDocument());
    expect(screen.queryByText("login-screen")).not.toBeInTheDocument();
  });

  it("submits the new password to the confirm endpoint and shows a success message", async () => {
    setUrl("?reset_token=abc123");
    vi.mocked(getAuth).mockReturnValue(null);
    vi.mocked(api).mockRejectedValue(new Error("unauthorized"));
    vi.mocked(post).mockResolvedValue({ message: "ok" });
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("パスワード再設定")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("新しいパスワード"), { target: { value: "new-pw-123" } });
    fireEvent.change(screen.getByPlaceholderText("新しいパスワード（確認）"), { target: { value: "new-pw-123" } });
    fireEvent.click(screen.getByRole("button", { name: "パスワードを再設定" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/auth/password-reset/confirm", { token: "abc123", new_password: "new-pw-123" }));
    await waitFor(() => expect(screen.getByText(/パスワードを再設定しました/)).toBeInTheDocument());
  });

  it("shows a mismatch error without calling the API when confirmation doesn't match", async () => {
    setUrl("?reset_token=abc123");
    vi.mocked(getAuth).mockReturnValue(null);
    vi.mocked(api).mockRejectedValue(new Error("unauthorized"));
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("パスワード再設定")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("新しいパスワード"), { target: { value: "new-pw-123" } });
    fireEvent.change(screen.getByPlaceholderText("新しいパスワード（確認）"), { target: { value: "mismatch" } });
    fireEvent.click(screen.getByRole("button", { name: "パスワードを再設定" }));

    expect(screen.getByText("新しいパスワード（確認）が一致しません。")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
