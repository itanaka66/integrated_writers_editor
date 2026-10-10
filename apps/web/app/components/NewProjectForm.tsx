"use client";
import { useState } from "react";
import { post } from "../lib/api";
import { Project } from "../lib/types";
import { useT } from "../lib/i18n";

export default function NewProjectForm({ onCreated, onCancel }: { onCreated: (p: Project) => void; onCancel: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const p = await post("/projects", { name, genre, description, rules });
      onCreated(p);
    } catch {
      setError(t("newProject.createFailed"));
    } finally { setBusy(false); }
  }

  return (
    <div className="modalOverlay" onClick={onCancel}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <h1>{t("newProject.title")}</h1>
        <label>{t("newProject.name")}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("newProject.namePh")} autoFocus /></label>
        <label>{t("newProject.category")}<input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder={t("newProject.categoryPh")} /></label>
        <label>{t("newProject.description")}<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("newProject.descriptionPh")} /></label>
        <label>{t("newProject.notes")}<textarea value={rules} onChange={(e) => setRules(e.target.value)} placeholder={t("newProject.notesPh")} /></label>
        {error && <div className="loginError">{error}</div>}
        <div className="modalActions">
          <button onClick={onCancel}>{t("common.cancel")}</button>
          <button onClick={create} disabled={busy || !name.trim()}>{busy ? t("newProject.creating") : t("newProject.create")}</button>
        </div>
      </div>
    </div>
  );
}
