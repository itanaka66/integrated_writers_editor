"use client";
import { useEffect, useState } from "react";
import { marked } from "marked";
import { api, del, post } from "../lib/api";
import { useLlmActivity } from "../lib/llmActivity";
import { useT } from "../lib/i18n";

type Msg = { id: number; role: "user" | "assistant"; content: string };

export default function ChatPanel({ projectId }: { projectId: number }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const llm = useLlmActivity();
  const t = useT();

  async function load() {
    setMessages(await api(`/projects/${projectId}/chat`));
  }
  useEffect(() => { load(); }, [projectId]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const act = llm.begin(t("chat.working"));
    try {
      const turns = await post(`/projects/${projectId}/chat`, { content: text });
      setMessages((m) => [...m, ...turns]);
    } finally {
      act.end();
      setBusy(false);
    }
  }
  async function clear() {
    if (!confirm(t("chat.confirmClear"))) return;
    await del(`/projects/${projectId}/chat`);
    setMessages([]);
  }

  return (
    <div className="panel chatPanel">
      <div className="chatHeader">
        <div><small>AI CHAT</small><h1>{t("chat.title")}</h1></div>
        {messages.length > 0 && <button className="historyButton" onClick={clear}>{t("chat.clear")}</button>}
      </div>
      <p>{t("chat.intro")}</p>
      <div className="chatMessages">
        {messages.length === 0 && <div className="card"><b>{t("chat.emptyTitle")}</b><p>{t("chat.emptyHint")}</p></div>}
        {messages.map((m) => (
          <div className={`chatBubble ${m.role}`} key={m.id}>
            <b>{m.role === "user" ? t("chat.you") : "AI"}</b>
            {/* Single-user app; content is always this same admin's own
                Markdown or this same admin's AI conversation (never
                third-party input), so raw HTML rendering here carries no
                cross-user XSS risk — same reasoning as WritePanel's preview.
                Rendering as Markdown (instead of a plain <p>) is what keeps
                AI replies with headings/tables/rules from turning into an
                unreadable wall of "##"/"|"/"---" run together on one line. */}
            <div className="chatMarkdown" dangerouslySetInnerHTML={{ __html: marked.parse(m.content || "", { async: false, breaks: true }) as string }} />
          </div>
        ))}
        {busy && <div className="chatBubble assistant"><b>AI</b><p className="thinking">{t("chat.thinking")}</p></div>}
      </div>
      <div className="chatInputRow">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("chat.placeholder")} disabled={busy} />
        <button onClick={send} disabled={busy}>{t("chat.send")}</button>
      </div>
    </div>
  );
}
