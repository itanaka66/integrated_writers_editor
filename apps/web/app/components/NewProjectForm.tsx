"use client";
import { useState } from "react";
import { post } from "../lib/api";
import { Project } from "../lib/types";

export default function NewProjectForm({ onCreated, onCancel }: { onCreated: (p: Project) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [episodeGoal, setEpisodeGoal] = useState(500);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await post("/projects", { name, genre, description, rules, episode_goal: episodeGoal });
      onCreated(p);
    } finally { setBusy(false); }
  }

  return (
    <div className="modalOverlay" onClick={onCancel}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <h1>新規プロジェクト作成</h1>
        <label>プロジェクト名 *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例）技術ブログ" autoFocus /></label>
        <label>カテゴリ<input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="技術・ライフスタイルなど" /></label>
        <label>説明<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="プロジェクトの説明を入力してください。" /></label>
        <label>執筆メモ（任意）<textarea value={rules} onChange={(e) => setRules(e.target.value)} placeholder="文体・想定読者など" /></label>
        <label>目標記事数<input type="number" value={episodeGoal} min={1} onChange={(e) => setEpisodeGoal(Number(e.target.value))} /></label>
        <div className="modalActions">
          <button onClick={onCancel}>キャンセル</button>
          <button onClick={create} disabled={busy || !name.trim()}>{busy ? "作成中..." : "作成する"}</button>
        </div>
      </div>
    </div>
  );
}
