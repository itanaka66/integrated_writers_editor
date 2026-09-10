"use client";
import { useEffect, useState } from "react";
import { marked } from "marked";
import { api, del, post } from "../lib/api";

type Msg = { id: number; role: "user" | "assistant"; content: string };

export default function ChatPanel({ projectId }: { projectId: number }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setMessages(await api(`/projects/${projectId}/chat`));
  }
  useEffect(() => { load(); }, [projectId]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    try {
      const turns = await post(`/projects/${projectId}/chat`, { content: text });
      setMessages((m) => [...m, ...turns]);
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    if (!confirm("会話履歴を削除しますか？")) return;
    await del(`/projects/${projectId}/chat`);
    setMessages([]);
  }

  return (
    <div className="panel chatPanel">
      <div className="chatHeader">
        <div><small>AI CHAT</small><h1>AIチャット</h1></div>
        {messages.length > 0 && <button className="historyButton" onClick={clear}>履歴を削除</button>}
      </div>
      <p>Context Builder（本文・人物・世界観・プロット・伏線・RAG）を踏まえた自由対話です。会話履歴はこの作品ごとにサーバーに保存され、次回開いたときも表示されます。</p>
      <div className="chatMessages">
        {messages.length === 0 && <div className="card"><b>質問してみましょう</b><p>例：「田中の現在の目標は？」「第3話の伏線はまだ回収されていない？」</p></div>}
        {messages.map((m) => (
          <div className={`chatBubble ${m.role}`} key={m.id}>
            <b>{m.role === "user" ? "あなた" : "AI"}</b>
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
        {busy && <div className="chatBubble assistant"><b>AI</b><p className="thinking">考えています...</p></div>}
      </div>
      <div className="chatInputRow">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="質問を入力..." disabled={busy} />
        <button onClick={send} disabled={busy}>送信</button>
      </div>
    </div>
  );
}
