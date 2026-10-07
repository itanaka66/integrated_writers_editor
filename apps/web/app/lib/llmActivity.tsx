"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import LlmProgressView from "../components/LlmProgressView";

export type LlmActivityHandle = {
  update: (patch: { progress?: number; detail?: string }) => void;
  end: () => void;
};
type BeginOpts = { cancel?: () => void };
type Activity = { id: number; label: string; detail?: string; progress?: number; startedAt: number; cancel?: () => void };

type Ctx = { begin: (label: string, opts?: BeginOpts) => LlmActivityHandle };

const noopHandle: LlmActivityHandle = { update: () => {}, end: () => {} };
const LlmActivityContext = createContext<Ctx>({ begin: () => noopHandle });

// Without a provider (e.g. isolated component tests) begin() is a no-op.
export function useLlmActivity() {
  return useContext(LlmActivityContext);
}

export function LlmActivityProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Activity[]>([]);
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

  const value = useMemo(() => ({ begin }), [begin]);
  const current = items[items.length - 1];

  return (
    <LlmActivityContext.Provider value={value}>
      {children}
      {current && (
        <div className="modalOverlay llmProgressOverlay">
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="AI処理中">
            <LlmProgressView
              label={current.label}
              detail={current.detail}
              progress={current.progress}
              startedAt={current.startedAt}
              onCancel={current.cancel}
            />
            {items.length > 1 && <small>ほか {items.length - 1} 件の処理が進行中です</small>}
          </div>
        </div>
      )}
    </LlmActivityContext.Provider>
  );
}
