import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Login from "./Login";
import { api, setAuth } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  setAuth: vi.fn(),
}));

describe("Login", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(setAuth).mockReset();
  });

  it("stores credentials and calls onLoggedIn when the check succeeds", async () => {
    vi.mocked(api).mockResolvedValue([]);
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

  it("disables the OAuth buttons since there is no OAuth integration", () => {
    render(<Login onLoggedIn={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "GitHubでログイン" })).toBeDisabled();
  });
});
