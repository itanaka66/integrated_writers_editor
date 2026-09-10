"use client";
import { FormEvent, useState } from "react";
import { api, setAuth } from "../lib/api";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError(""); setBusy(true);
    setAuth(username, password);
    try {
      await api("/projects");
      onLoggedIn();
    } catch {
      setError("ユーザー名またはパスワードが違います。");
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
        <button type="button" className="loginOAuth" disabled title="現在は管理者パスワードでのログインのみ対応しています">Googleでログイン</button>
        <button type="button" className="loginOAuth" disabled title="現在は管理者パスワードでのログインのみ対応しています">GitHubでログイン</button>
      </form>
    </div>
  );
}
