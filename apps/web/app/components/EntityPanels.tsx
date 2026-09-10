"use client";
import { useEffect, useState } from "react";
import { api, post, put, del } from "../lib/api";

type Field = { key: string; label: string; type?: "text" | "textarea" | "number" | "select"; options?: string[] };
type EntityConfig = {
  title: string;
  hint: string;
  listPath: (pid: number) => string;
  itemPath: (id: number) => string;
  titleField: string;
  subtitleField?: string;
  bodyField?: string;
  fields: Field[];
  defaults: Record<string, unknown>;
  // Optional client-side filter over the fetched list (used to split World
  // entities into 世界観 vs 用語集 without a separate backend endpoint).
  filter?: (item: Record<string, unknown>) => boolean;
};

function emptyForm(cfg: EntityConfig) {
  // Start from cfg.defaults so hidden defaults (e.g. GlossaryPanel's
  // entity_type: "glossary", which isn't an editable field) still get sent
  // on create, not just fields the user can see and edit.
  const f: Record<string, unknown> = { ...cfg.defaults };
  for (const field of cfg.fields) if (!(field.key in f)) f[field.key] = "";
  return f;
}

export function EntityPanel({ projectId, cfg }: { projectId: number; cfg: EntityConfig }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm(cfg));

  async function load() {
    setBusy(true);
    try {
      const list = await api(cfg.listPath(projectId));
      setItems(cfg.filter ? list.filter(cfg.filter) : list);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, [projectId]);

  function startCreate() { setForm(emptyForm(cfg)); setEditing("new"); }
  function startEdit(item: Record<string, unknown>) { setForm({ ...item }); setEditing(item.id as number); }
  function cancel() { setEditing(null); }

  async function save() {
    if (editing === "new") await post(cfg.listPath(projectId), form);
    else if (editing !== null) await put(cfg.itemPath(editing), form);
    setEditing(null);
    await load();
  }
  async function remove(id: number) {
    if (!confirm("削除しますか？")) return;
    await del(cfg.itemPath(id));
    await load();
  }

  return (
    <div className="panel">
      <small>STORY KNOWLEDGE</small>
      <h1>{cfg.title}</h1>
      <p>{cfg.hint}</p>
      <button className="add" onClick={startCreate}>＋ 追加</button>
      {editing !== null && (
        <div className="entityForm">
          {cfg.fields.map((f) => (
            <label key={f.key}>
              {f.label}
              {f.type === "textarea" ? (
                <textarea value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              ) : f.type === "select" ? (
                <select value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })}
                />
              )}
            </label>
          ))}
          <div className="entityFormActions">
            <button onClick={save}>{editing === "new" ? "作成" : "保存"}</button>
            <button onClick={cancel}>キャンセル</button>
          </div>
        </div>
      )}
      <div className="cards">
        {busy && items.length === 0 ? <p className="loading">読み込み中...</p> : null}
        {items.map((x) => (
          <div className="card" key={x.id as number}>
            <b>{String(x[cfg.titleField] ?? "")}</b>
            {cfg.subtitleField && <span>{String(x[cfg.subtitleField] ?? "")}</span>}
            {cfg.bodyField && <p>{String(x[cfg.bodyField] ?? "") || "設定未入力"}</p>}
            <div className="cardActions">
              <button onClick={() => startEdit(x)}>編集</button>
              <button onClick={() => remove(x.id as number)}>削除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CharacterPanel({ projectId }: { projectId: number }) {
  return <EntityPanel projectId={projectId} cfg={{
    title: "キャラクター", hint: "作品の正本情報。AI Context Builderが生成時に参照します。",
    listPath: (pid) => `/projects/${pid}/characters`, itemPath: (id) => `/characters/${id}`,
    titleField: "name", subtitleField: "role", bodyField: "personality",
    fields: [
      { key: "name", label: "名前" }, { key: "role", label: "役割" },
      { key: "personality", label: "性格", type: "textarea" }, { key: "speech_style", label: "口調", type: "textarea" },
      { key: "goal", label: "目標", type: "textarea" },
      { key: "status", label: "状態", type: "select", options: ["alive", "dead", "missing", "unknown"] },
      { key: "description", label: "補足", type: "textarea" },
    ],
    defaults: { status: "alive" },
  }} />;
}

export function WorldPanel({ projectId }: { projectId: number }) {
  return <EntityPanel projectId={projectId} cfg={{
    title: "世界観", hint: "場所・組織・技術・魔法などの世界設定。",
    listPath: (pid) => `/projects/${pid}/world`, itemPath: (id) => `/world/${id}`,
    titleField: "name", subtitleField: "entity_type", bodyField: "description",
    filter: (x) => x.entity_type !== "glossary",
    fields: [
      { key: "name", label: "名称" },
      { key: "entity_type", label: "種類", type: "select", options: ["setting", "location", "technology", "magic", "organization", "item"] },
      { key: "description", label: "説明", type: "textarea" }, { key: "rules", label: "ルール", type: "textarea" },
      { key: "location", label: "場所" }, { key: "era", label: "時代" },
    ],
    defaults: { entity_type: "setting" },
  }} />;
}

export function GlossaryPanel({ projectId }: { projectId: number }) {
  return <EntityPanel projectId={projectId} cfg={{
    title: "用語集", hint: "作品固有の用語。世界観データベースに entity_type=\"glossary\" として保存されます。",
    listPath: (pid) => `/projects/${pid}/world`, itemPath: (id) => `/world/${id}`,
    titleField: "name", subtitleField: "location", bodyField: "description",
    filter: (x) => x.entity_type === "glossary",
    fields: [{ key: "name", label: "用語" }, { key: "description", label: "説明", type: "textarea" }, { key: "location", label: "カテゴリ" }],
    defaults: { entity_type: "glossary" },
  }} />;
}

export function PlotPanel({ projectId }: { projectId: number }) {
  return <EntityPanel projectId={projectId} cfg={{
    title: "プロット", hint: "作品全体および各アークの構成。",
    listPath: (pid) => `/projects/${pid}/plots`, itemPath: (id) => `/plots/${id}`,
    titleField: "title", subtitleField: "status", bodyField: "objective",
    fields: [
      { key: "title", label: "タイトル" },
      { key: "plot_type", label: "種類", type: "select", options: ["main_arc", "arc", "subplot"] },
      { key: "status", label: "状態", type: "select", options: ["planned", "active", "completed"] },
      { key: "start_episode", label: "開始話数", type: "number" }, { key: "end_episode", label: "終了話数", type: "number" },
      { key: "objective", label: "目的", type: "textarea" }, { key: "conflict", label: "対立", type: "textarea" },
      { key: "resolution", label: "決着", type: "textarea" },
    ],
    defaults: { plot_type: "arc", status: "planned" },
  }} />;
}

export function ForeshadowPanel({ projectId }: { projectId: number }) {
  return <EntityPanel projectId={projectId} cfg={{
    title: "伏線", hint: "設置・回収の状態を管理します。",
    listPath: (pid) => `/projects/${pid}/foreshadowings`, itemPath: (id) => `/foreshadowings/${id}`,
    titleField: "title", subtitleField: "status", bodyField: "description",
    fields: [
      { key: "title", label: "タイトル" }, { key: "description", label: "説明", type: "textarea" },
      { key: "setup_episode", label: "設置話数", type: "number" }, { key: "payoff_episode", label: "回収話数", type: "number" },
      { key: "status", label: "状態", type: "select", options: ["open", "resolved", "abandoned"] },
    ],
    defaults: { status: "open" },
  }} />;
}

export function TimelinePanel({ projectId }: { projectId: number }) {
  return <EntityPanel projectId={projectId} cfg={{
    title: "年表", hint: "エピソード番号に紐づく出来事の年表。",
    listPath: (pid) => `/projects/${pid}/timeline`, itemPath: (id) => `/timeline/${id}`,
    titleField: "title", subtitleField: "world_time", bodyField: "description",
    fields: [
      { key: "episode_number", label: "話数", type: "number" }, { key: "title", label: "出来事" },
      { key: "world_time", label: "世界内時間" }, { key: "description", label: "説明", type: "textarea" },
    ],
    defaults: { episode_number: 1 },
  }} />;
}
