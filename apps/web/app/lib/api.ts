const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// The backend protects every /api/v1/* route (except /health) with a single
// shared HTTP Basic Auth admin/password pair — see apps/api/app/auth.py.
// There's no session/token, so "logging in" here just means resending these
// credentials from localStorage on every request.
const AUTH_KEY = "ns-auth";

export function getAuth(): { u: string; pw: string } | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function setAuth(u: string, pw: string) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ u, pw }));
  } catch {
    /* localStorage unavailable; session just won't persist */
  }
}
export function clearAuth() {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function api(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const headers = new Headers(opts?.headers);
  if (auth) headers.set("Authorization", "Basic " + btoa(`${auth.u}:${auth.pw}`));
  const r = await fetch(API + path, { ...opts, headers });
  if (r.status === 401) {
    onUnauthorized?.();
    throw new Error("unauthorized");
  }
  if (r.status === 204) return null;
  return r.json();
}
export async function post(p: string, b: unknown) {
  return api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
}
export async function put(p: string, b: unknown) {
  return api(p, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
}
export async function postFile(p: string, file: File) {
  // No Content-Type header here on purpose — the browser sets the
  // multipart boundary itself; overriding it breaks the upload.
  const form = new FormData();
  form.append("file", file);
  return api(p, { method: "POST", body: form });
}
export async function postForm(p: string, fields: Record<string, string | File | undefined>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) form.append(k, v);
  }
  return api(p, { method: "POST", body: form });
}
export async function del(p: string) {
  return api(p, { method: "DELETE" });
}

// Server-Sent Events, consumed manually via fetch()+ReadableStream instead of
// the browser's native EventSource — EventSource can't send an Authorization
// header, and this API requires one on every request. Returns a function
// that aborts the stream (call it on unmount / when switching jobs).
export function streamSSE(path: string, onMessage: (data: unknown) => void, onDone?: () => void, body?: unknown): () => void {
  const controller = new AbortController();
  (async () => {
    const auth = getAuth();
    const headers = new Headers();
    if (auth) headers.set("Authorization", "Basic " + btoa(`${auth.u}:${auth.pw}`));
    const init: RequestInit = { headers, signal: controller.signal };
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.method = "POST";
      init.body = JSON.stringify(body);
    }
    try {
      const r = await fetch(API + path, init);
      if (r.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!r.body) return;
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            onMessage(JSON.parse(line.slice(6)));
          } catch {
            /* malformed chunk; ignore */
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") throw err;
    } finally {
      onDone?.();
    }
  })();
  return () => controller.abort();
}

// Triggers a browser download for an endpoint that returns a file body
// (Content-Disposition: attachment) rather than JSON — export downloads.
export async function downloadFile(path: string, fallbackFilename: string) {
  const auth = getAuth();
  const headers = new Headers();
  if (auth) headers.set("Authorization", "Basic " + btoa(`${auth.u}:${auth.pw}`));
  const r = await fetch(API + path, { headers });
  if (r.status === 401) {
    onUnauthorized?.();
    throw new Error("unauthorized");
  }
  if (!r.ok) throw new Error(`Export failed: ${r.status}`);
  const blob = await r.blob();
  const disposition = r.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
