// Desktop notifications for long-running background jobs (auto-write,
// file import) finishing while the user's attention is elsewhere. Browser
// Notification API only — no server push, no service worker — so this
// only fires while the tab that started/is watching the job is open.

export function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

// Requests permission, but only actually prompts the browser once per
// origin (subsequent calls just read the already-decided permission) —
// call this from a user gesture (e.g. the "開始" button), not on mount,
// since some browsers ignore/auto-deny a request with no gesture behind it.
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch {
    return false;
  }
}

export function notify(title: string, body?: string) {
  if (!canNotify() || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    // Some platforms (e.g. an insecure context, or a browser quirk) throw
    // on construction even when permission is "granted" — a missed
    // notification isn't worth surfacing an error for.
  }
}
