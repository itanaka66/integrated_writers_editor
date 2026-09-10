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
        <h1>新規作品作成</h1>
        <label>作品名 *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例）恐竜文明開拓記" autoFocus /></label>
        <label>ジャンル<input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="SF・ファンタジー" /></label>
        <label>あらすじ<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="作品のあらすじを入力してください。" /></label>
        <label>詳細設定（任意）<textarea value={rules} onChange={(e) => setRules(e.target.value)} placeholder="文体・想定読者・外せない設定ルールなど" /></label>
        <label>総話数目標<input type="number" value={episodeGoal} min={1} onChange={(e) => setEpisodeGoal(Number(e.target.value))} /></label>
        <div className="modalActions">
          <button onClick={onCancel}>キャンセル</button>
          <button onClick={create} disabled={busy || !name.trim()}>{busy ? "作成中..." : "作成する"}</button>
        </div>
      </div>
    </div>
  );
}
