"use client";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError, oauthUrl, post, setAuth } from "../lib/api";
import { LANGUAGES, LanguageCode, isLanguageCode, resolveLanguage, setStoredLanguage } from "../lib/i18n";

// NOTE: every screen shown before login is intentionally English-only (it does
// NOT use the active-language dictionaries). The language <select> below is the
// one place a language is chosen; its option labels are the languages' own names.

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean; github: boolean }>({ google: false, github: false });
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  // "en" for the server render / first paint, then the stored (or browser) choice.
  const [language, setLanguage] = useState<LanguageCode>("en");

  useEffect(() => { setLanguage(resolveLanguage()); }, []);

  function chooseLanguage(value: string) {
    if (!isLanguageCode(value)) return;
    setLanguage(value);
    // Persist immediately (not only on submit) so the choice survives the
    // full-page OAuth2 redirect.
    setStoredLanguage(value);
  }

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
    setStoredLanguage(language);
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
        setError("Incorrect username or password.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Access is temporarily locked after repeated failed sign-in attempts. Please wait a while and try again.");
      } else {
        setError("Could not connect to the API. Check that the server is running and that CORS_ORIGINS in .env includes this page's address.");
      }
    } finally { setBusy(false); }
  }

  async function submitForgotPassword() {
    setForgotBusy(true);
    try {
      const r: { message: string } = await post("/auth/password-reset/request", { email: forgotEmail });
      setForgotMessage(r.message);
    } catch {
      // The endpoint always returns 200; a thrown error here means a
      // connection problem, not an invalid email — show a generic note.
      setForgotMessage("Failed to send the request. Please try again later.");
    } finally { setForgotBusy(false); }
  }

  return (
    <div className="center">
      <form className="loginCard" onSubmit={submit}>
        <b>✦ Integrated writers Editor</b>
        <p>Your story, created with AI</p>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="loginError">{error}</div>}
        <label className="loginLanguage" style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Language
          <select value={language} onChange={(e) => chooseLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        <button
          type="button"
          className="loginForgotLink"
          onClick={() => { setShowForgotPassword((v) => !v); setForgotMessage(""); }}
        >
          Forgot your password?
        </button>
        {showForgotPassword && (
          <div className="loginForgotForm">
            {!forgotMessage ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  placeholder="Registered email address" type="email" value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitForgotPassword(); } }}
                />
                <button type="button" onClick={submitForgotPassword} disabled={forgotBusy || !forgotEmail}>{forgotBusy ? "Sending..." : "Send reset email"}</button>
              </div>
            ) : (
              <p className="savedNote">{forgotMessage}</p>
            )}
          </div>
        )}
        <div className="loginDivider">or</div>
        <button
          type="button"
          className="loginOAuth"
          disabled={!providers.google}
          title={providers.google ? undefined : "Only administrator password sign-in is currently available"}
          onClick={() => oauthLogin("google")}
        >
          Sign in with Google
        </button>
        <button
          type="button"
          className="loginOAuth"
          disabled={!providers.github}
          title={providers.github ? undefined : "Only administrator password sign-in is currently available"}
          onClick={() => oauthLogin("github")}
        >
          Sign in with GitHub
        </button>
      </form>
    </div>
  );
}
