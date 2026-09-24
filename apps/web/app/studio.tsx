"use client";
import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { api, clearAuth, getAuth, post, setUnauthorizedHandler } from "./lib/api";
import { Project } from "./lib/types";
import Login from "./components/Login";
import Sidebar, { Section } from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ProjectHome from "./components/ProjectHome";
import WritePanel from "./components/WritePanel";
import MaterialsPanel from "./components/MaterialsPanel";
import SearchPanel from "./components/SearchPanel";
import ChatPanel from "./components/ChatPanel";
import SettingsPanel from "./components/SettingsPanel";
import Resizer from "./components/Resizer";
import { useResizableWidth } from "./lib/useResizableWidth";

export default function Studio() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  // A ?reset_token=... query param means someone followed a "forgot
  // password" email link — that has to work whether or not they currently
  // have a session, so it's checked before (and independently of) the
  // authed/unauthed decision below.
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setResetToken(params.get("reset_token"));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { clearAuth(); setAuthed(false); });
    // localStorage creds are the fast, common-case path for existing Basic
    // Auth users, but the real source of truth is now "did an authenticated
    // request succeed" — an OAuth2 login has nothing in localStorage at
    // all, only a session cookie, so it can only be detected by asking the
    // API. /auth/me is the cheapest authenticated call that does that.
    if (getAuth()) setAuthed(true);
    api("/auth/me")
      .then(() => setAuthed(true))
      .catch(() => setAuthed((prev) => (prev ? prev : false)));
    return () => setUnauthorizedHandler(null);
  }, []);

  if (resetToken) return <PasswordResetScreen token={resetToken} />;
  if (authed === null) return <div className="center">確認中...</div>;
  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;
  return <Workspace />;
}

function PasswordResetScreen({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("新しいパスワード（確認）が一致しません。");
      return;
    }
    setBusy(true);
    try {
      await post("/auth/password-reset/confirm", { token, new_password: newPassword });
      setDone(true);
    } catch {
      setError("このリンクは無効か、有効期限が切れています。もう一度パスワード再設定をお試しください。");
    } finally { setBusy(false); }
  }

  function backToLogin() {
    // Clear the query param and land on the normal Login screen.
    window.location.href = "/";
  }

  return (
    <div className="center">
      <form className="loginCard" onSubmit={submit}>
        <b>✦ Integrated writers Editor</b>
        <p>パスワード再設定</p>
        {done ? (
          <>
            <p className="savedNote">パスワードを再設定しました。新しいパスワードでログインしてください。</p>
            <button type="button" onClick={backToLogin}>ログイン画面へ</button>
          </>
        ) : (
          <>
            <input
              placeholder="新しいパスワード" type="password" value={newPassword} autoFocus
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              placeholder="新しいパスワード（確認）" type="password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {error && <div className="loginError">{error}</div>}
            <button type="submit" disabled={busy || !newPassword}>{busy ? "再設定中..." : "パスワードを再設定"}</button>
          </>
        )}
      </form>
    </div>
  );
}

function Workspace() {
  const [project, setProject] = useState<Project | null>(null);
  const [section, setSection] = useState<Section>("home");

  const sidebar = useResizableWidth("ine-sidebar-width", { defaultWidth: 200, min: 160, max: 340, direction: "left" });
  if (!project) return <Dashboard onOpen={(p) => { setProject(p); setSection("home"); }} />;

  const tabs: { key: Section; label: string }[] = [
    { key: "home", label: "🏠 ホーム" },
    { key: "write", label: "✎ 執筆" },
    { key: "materials", label: "🗂 資料" },
    { key: "search", label: "🔍 検索" },
    { key: "chat", label: "💬 AIチャット" },
    { key: "settings", label: "⚙ 設定" },
  ];

  return (
    <div className="appShell" style={{ "--sidebarW": `${sidebar.width}px` } as CSSProperties}>
      <Sidebar
        project={project} section={section} onSection={setSection} onDashboard={() => setProject(null)}
        resizer={<Resizer side="right" onPointerDown={sidebar.startDrag} />}
      />
      <div className="appContent">
        <nav className="appTabBar">
          {tabs.map((t) => (
            <button key={t.key} className={section === t.key ? "appTab active" : "appTab"} onClick={() => setSection(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
        <main className="appMain">
          {section === "home" && <ProjectHome project={project} onSection={setSection} />}
          {section === "write" && <WritePanel project={project} />}
          {section === "materials" && <MaterialsPanel projectId={project.id} />}
          {section === "search" && <SearchPanel projectId={project.id} />}
          {section === "chat" && <ChatPanel projectId={project.id} />}
          {section === "settings" && <SettingsPanel project={project} onSaved={setProject} />}
        </main>
      </div>
    </div>
  );
}
