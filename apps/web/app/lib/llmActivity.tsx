"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import LlmProgressView from "../components/LlmProgressView";
import LlmQueueList, { LlmQueueData } from "../components/LlmQueueList";
import { api } from "./api";

export type LlmActivityHandle = {
  update: (patch: { progress?: number; detail?: string }) => void;
  end: () => void;
};
type BeginOpts = { cancel?: () => void };
type Activity = { id: number; label: string; detail?: string; progress?: number; startedAt: number; cancel?: () => void };

type Ctx = { begin: (label: string, opts?: BeginOpts) => LlmActivityHandle; openQueue: () => void };

const noopHandle: LlmActivityHandle = { update: () => {}, end: () => {} };
const LlmActivityContext = createContext<Ctx>({ begin: () => noopHandle, openQueue: () => {} });

// Without a provider (e.g. isolated component tests) begin() is a no-op.
export function useLlmActivity() {
  return useContext(LlmActivityContext);
}

export const QUEUE_POLL_MS = 1000;

export function LlmActivityProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [queue, setQueue] = useState<LlmQueueData | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const nextId = useRef(1);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const begin = useCallback((label: string, opts?: BeginOpts): LlmActivityHandle => {
    const id = nextId.current++;
    setItems((xs) => [...xs, { id, label, startedAt: Date.now(), cancel: opts?.cancel }]);
    return {
      update: (patch) => { if (mounted.current) setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x))); },
      end: () => { if (mounted.current) setItems((xs) => xs.filter((x) => x.id !== id)); },
    };
  }, []);
  const openQueue = useCallback(() => setPanelOpen(true), []);

  // Poll the server-side LLM queue only while something is on screen for it:
  // this client has an active LLM call, or the user opened the queue panel.
  const active = items.length > 0 || panelOpen;
  useEffect(() => {
    if (!active) { setQueue(null); return; }
    let stopped = false;
    const tick = () => {
      Promise.resolve(api("/llm/queue"))
        .then((q: LlmQueueData) => { if (!stopped && mounted.current && q && Array.isArray(q.running)) setQueue(q); })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, QUEUE_POLL_MS);
    return () => { stopped = true; clearInterval(t); };
  }, [active]);
  useEffect(() => {
    if (!active || me !== null) return;
    Promise.resolve(api("/auth/me"))
      .then((u: { username?: string }) => { if (mounted.current && u?.username) setMe(u.username); })
      .catch(() => {});
  }, [active, me]);

  const value = useMemo(() => ({ begin, openQueue }), [begin, openQueue]);
  const current = items[items.length - 1];

  return (
    <LlmActivityContext.Provider value={value}>
      {children}
      {active && (
        <div className="modalOverlay llmProgressOverlay">
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="AI処理中">
            {current ? (
              <LlmProgressView
                label={current.label}
                detail={current.detail}
                progress={current.progress}
                startedAt={current.startedAt}
                onCancel={current.cancel}
              />
            ) : (
              <b className="llmProgressLabel">AI処理キュー</b>
            )}
            {items.length > 1 && <small>ほか {items.length - 1} 件の処理が進行中です</small>}
            <LlmQueueList data={queue} me={me} showEmpty={!current} />
            {panelOpen && (
              <div className="modalActions"><button type="button" onClick={() => setPanelOpen(false)}>閉じる</button></div>
            )}
          </div>
        </div>
      )}
    </LlmActivityContext.Provider>
  );
}

// Sidebar entry: opens the queue panel (polling starts only once opened).
export function LlmQueueButton() {
  const { openQueue } = useLlmActivity();
  return <button type="button" className="appSidebarQueue" onClick={openQueue}>📋 AI処理キュー</button>;
}
