"use client";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError, oauthUrl, setAuth } from "../lib/api";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean; github: boolean }>({ google: false, github: false });

  useEffect(() => {
    api("/auth/providers")
      .then((p: { google: boolean; github: boolean }) => setProviders(p))
      .catch(() => { /* leave both disabled if this fails */ });
  }, []);

  function oauthLogin(provider: "google" | "github") {
    // A real browser navigation, not a fetch — this has to run through the
    // provider's own login page and back via a server-side redirect chain
    // that sets an httponly cookie.
    window.location.href = oauthUrl(`/login/${provider}`);
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError(""); setBusy(true);
    setAuth(username, password);
    try {
      await api("/projects");
      onLoggedIn();
    } catch (err) {
      // api() throws a specifically-worded Error only for a real 401 —
      // anything else here (a network error, a CORS rejection) is not a
      // credentials problem, and telling the user their password is wrong
      // sends them on a wild goose chase re-typing a password that was
      // never the issue. See .env.example's CORS_ORIGINS comment if this
      // keeps happening after double-checking the password.
      if (err instanceof Error && err.message === "unauthorized") {
        setError("ユーザー名またはパスワードが違います。");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("ログイン試行の失敗が続いたため、一時的にアクセスがロックされています。しばらく待ってから再度お試しください。");
      } else {
        setError("APIに接続できませんでした。サーバーが起動しているか、.envのCORS_ORIGINSにこのページのアドレスが含まれているかを確認してください。");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="center">
      <form className="loginCard" onSubmit={submit}>
        <b>✦ Integrated writers Editor</b>
        <p>AIと創る、あなただけの物語</p>
        <input placeholder="ユーザー名" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <input placeholder="パスワード" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="loginError">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? "確認中..." : "ログイン"}</button>
        <div className="loginDivider">または</div>
        <button
          type="button"
          className="loginOAuth"
          disabled={!providers.google}
          title={providers.google ? undefined : "現在は管理者パスワードでのログインのみ対応しています"}
          onClick={() => oauthLogin("google")}
        >
          Googleでログイン
        </button>
        <button
          type="button"
          className="loginOAuth"
          disabled={!providers.github}
          title={providers.github ? undefined : "現在は管理者パスワードでのログインのみ対応しています"}
          onClick={() => oauthLogin("github")}
        >
          GitHubでログイン
        </button>
      </form>
    </div>
  );
}
