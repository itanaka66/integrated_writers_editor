import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canNotify, ensureNotificationPermission, notify } from "./notify";

describe("notify", () => {
  const originalNotification = (window as any).Notification;

  afterEach(() => {
    (window as any).Notification = originalNotification;
  });

  it("canNotify is false when the Notification API is unavailable", () => {
    delete (window as any).Notification;
    expect(canNotify()).toBe(false);
  });

  describe("with a fake Notification API", () => {
    let permission: string;
    let constructed: { title: string; options: any }[];

    beforeEach(() => {
      constructed = [];
      permission = "default";
      class FakeNotification {
        static get permission() { return permission; }
        static requestPermission = vi.fn(async () => permission);
        constructor(title: string, options?: any) {
          constructed.push({ title, options });
        }
      }
      (window as any).Notification = FakeNotification;
    });

    it("canNotify is true", () => {
      expect(canNotify()).toBe(true);
    });

    it("ensureNotificationPermission returns true without prompting when already granted", async () => {
      permission = "granted";
      const ok = await ensureNotificationPermission();
      expect(ok).toBe(true);
      expect((window as any).Notification.requestPermission).not.toHaveBeenCalled();
    });

    it("ensureNotificationPermission returns false without prompting when denied", async () => {
      permission = "denied";
      const ok = await ensureNotificationPermission();
      expect(ok).toBe(false);
      expect((window as any).Notification.requestPermission).not.toHaveBeenCalled();
    });

    it("ensureNotificationPermission prompts when permission is undecided", async () => {
      permission = "default";
      (window as any).Notification.requestPermission = vi.fn(async () => "granted");
      const ok = await ensureNotificationPermission();
      expect(ok).toBe(true);
      expect((window as any).Notification.requestPermission).toHaveBeenCalled();
    });

    it("notify constructs a Notification when permission is granted", () => {
      permission = "granted";
      notify("タイトル", "本文");
      expect(constructed).toEqual([{ title: "タイトル", options: { body: "本文" } }]);
    });

    it("notify does nothing when permission is not granted", () => {
      permission = "default";
      notify("タイトル");
      expect(constructed).toEqual([]);
    });
  });
});
