import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Login from "./Login";
import { api, ApiError, post, setAuth } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: vi.fn(),
  post: vi.fn(),
  setAuth: vi.fn(),
}));

// api() is called for both the login-check ("/projects") and the
// provider-list fetch ("/auth/providers") — route each so tests can assert
// on either independently of call order.
function mockApiRoutes(routes: Record<string, unknown>) {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path in routes) {
      const v = routes[path];
      if (v instanceof Error) throw v;
      return v;
    }
    return [];
  });
}

describe("Login", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(setAuth).mockReset();
    mockApiRoutes({ "/auth/providers": { google: false, github: false } });
  });

  it("stores credentials and calls onLoggedIn when the check succeeds", async () => {
    mockApiRoutes({ "/auth/providers": { google: false, github: false }, "/projects": [] });
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("ユーザー名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("パスワード"), { target: { value: "writers" } });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
    expect(setAuth).toHaveBeenCalledWith("admin", "writers");
  });

  it("shows an error and does not log in when the check fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("unauthorized"));
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("ユーザー名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("パスワード"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    await waitFor(() => expect(screen.getByText("ユーザー名またはパスワードが違います。")).toBeInTheDocument());
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("shows a connection error, not a credentials error, when the failure isn't a 401", async () => {
    vi.mocked(api).mockRejectedValue(new TypeError("Failed to fetch"));
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("ユーザー名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("パスワード"), { target: { value: "writers" } });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    await waitFor(() => expect(screen.getByText(/APIに接続できませんでした/)).toBeInTheDocument());
    expect(screen.queryByText("ユーザー名またはパスワードが違います。")).not.toBeInTheDocument();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("shows a lockout message on a 429 instead of the generic connection error", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(429, "request failed: 429"));
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("ユーザー名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("パスワード"), { target: { value: "writers" } });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    await waitFor(() => expect(screen.getByText(/ロックされています/)).toBeInTheDocument());
    expect(screen.queryByText(/APIに接続できませんでした/)).not.toBeInTheDocument();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("disables both OAuth buttons when no provider is configured", async () => {
    mockApiRoutes({ "/auth/providers": { google: false, github: false } });
    render(<Login onLoggedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "GitHubでログイン" })).toBeDisabled();
  });

  it("enables only the configured OAuth provider buttons", async () => {
    mockApiRoutes({ "/auth/providers": { google: true, github: false } });
    render(<Login onLoggedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "GitHubでログイン" })).toBeDisabled();
  });

  it("navigates the browser to the provider login URL on click", async () => {
    mockApiRoutes({ "/auth/providers": { google: true, github: true } });
    const originalLocation = window.location;
    // jsdom throws on direct assignment to window.location.href in some
    // versions; replace the whole object for the duration of the test.
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, href: "" },
    });
    render(<Login onLoggedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "GitHubでログイン" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "GitHubでログイン" }));
    expect(window.location.href).toContain("/auth/login/github");
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  it("shows and submits the forgot-password form, displaying the generic confirmation", async () => {
    vi.mocked(post).mockResolvedValue({ message: "ご入力いただいたメールアドレス宛に送信しました。" });
    render(<Login onLoggedIn={vi.fn()} />);

    fireEvent.click(screen.getByText("パスワードをお忘れですか？"));
    fireEvent.change(screen.getByPlaceholderText("登録済みのメールアドレス"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定メールを送信" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/auth/password-reset/request", { email: "user@example.com" }));
    await waitFor(() => expect(screen.getByText("ご入力いただいたメールアドレス宛に送信しました。")).toBeInTheDocument());
  });
});
