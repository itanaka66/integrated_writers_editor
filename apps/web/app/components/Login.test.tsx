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

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "writers" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
    expect(setAuth).toHaveBeenCalledWith("admin", "writers");
  });

  it("shows an error and does not log in when the check fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("unauthorized"));
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText("Incorrect username or password.")).toBeInTheDocument());
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("shows a connection error, not a credentials error, when the failure isn't a 401", async () => {
    vi.mocked(api).mockRejectedValue(new TypeError("Failed to fetch"));
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "writers" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText(/Could not connect to the API/)).toBeInTheDocument());
    expect(screen.queryByText("Incorrect username or password.")).not.toBeInTheDocument();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("shows a lockout message on a 429 instead of the generic connection error", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(429, "request failed: 429"));
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "writers" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText(/temporarily locked/)).toBeInTheDocument());
    expect(screen.queryByText(/Could not connect to the API/)).not.toBeInTheDocument();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("disables both OAuth buttons when no provider is configured", async () => {
    mockApiRoutes({ "/auth/providers": { google: false, github: false } });
    render(<Login onLoggedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeDisabled();
  });

  it("enables only the configured OAuth provider buttons", async () => {
    mockApiRoutes({ "/auth/providers": { google: true, github: false } });
    render(<Login onLoggedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeDisabled();
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
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sign in with GitHub" }));
    expect(window.location.href).toContain("/auth/login/github");
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  it("shows and submits the forgot-password form, displaying the generic confirmation", async () => {
    vi.mocked(post).mockResolvedValue({ message: "ご入力いただいたメールアドレス宛に送信しました。" });
    render(<Login onLoggedIn={vi.fn()} />);

    fireEvent.click(screen.getByText("Forgot your password?"));
    fireEvent.change(screen.getByPlaceholderText("Registered email address"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset email" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/auth/password-reset/request", { email: "user@example.com" }));
    await waitFor(() => expect(screen.getByText("ご入力いただいたメールアドレス宛に送信しました。")).toBeInTheDocument());
  });
});

describe("Login language selector and English-only text", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(api).mockReset();
    mockApiRoutes({ "/auth/providers": { google: false, github: false } });
    window.localStorage.clear();
  });

  it("shows only English text outside the language selector", () => {
    const { container } = render(<Login onLoggedIn={vi.fn()} />);
    fireEvent.click(screen.getByText("Forgot your password?"));
    const form = container.querySelector("form")!.cloneNode(true) as HTMLElement;
    form.querySelector("select")!.remove();
    const texts = [form.textContent ?? ""];
    form.querySelectorAll("[placeholder],[title]").forEach((el) => {
      texts.push(el.getAttribute("placeholder") ?? "", el.getAttribute("title") ?? "");
    });
    // The only non-ASCII character allowed is the brand glyph.
    expect(texts.join(" ").replace("✦", "")).toMatch(/^[\x00-\x7F]*$/);
  });

  it("lists all 8 languages by their native names", () => {
    render(<Login onLoggedIn={vi.fn()} />);
    const select = screen.getByRole("combobox");
    const names = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(names).toEqual(["English", "日本語", "简体中文", "한국어", "Español", "Français", "Deutsch", "Português"]);
  });

  it("persists the choice to localStorage as soon as it changes (survives an OAuth redirect)", () => {
    render(<Login onLoggedIn={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ko" } });
    expect(window.localStorage.getItem("ine-language")).toBe("ko");
    expect(screen.getByRole("combobox")).toHaveValue("ko");
    // The login screen itself stays English.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("pre-selects the stored language", async () => {
    window.localStorage.setItem("ine-language", "pt");
    render(<Login onLoggedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("pt"));
  });

  it("falls back to navigator.language on a first visit, and to English for unsupported languages", async () => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("de-AT");
    const { unmount } = render(<Login onLoggedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("de"));
    unmount();
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("it-IT");
    render(<Login onLoggedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("en"));
  });

  it("still works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mockApiRoutes({ "/auth/providers": { google: false, github: false }, "/projects": [] });
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);
    expect(screen.getByRole("combobox")).toHaveValue("en");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } });
    expect(screen.getByRole("combobox")).toHaveValue("fr");
    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
  });
});
