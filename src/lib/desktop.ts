"use client";

/**
 * Desktop bridge — the single seam between the shared EmberOS web app and the
 * native Tauri shell.
 *
 * Design rules that keep the web / Netlify build 100% unaffected:
 *   • NOTHING from `@tauri-apps/*` is imported at module top-level.
 *   • Every native call is a lazy `await import(...)` guarded by `isDesktop()`.
 *   • On the web `isDesktop()` is false, so none of that code ever loads.
 */

import { useSyncExternalStore } from "react";

/** Tauri injects this into every window it controls — the reliable signal. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const subscribeNever = () => () => {};

/** Hook version — false during SSR and first paint, then correct after mount. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => isDesktop(),
    () => false,
  );
}

/* ---------------- window controls (frameless title bar) ---------------- */

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export const desktopWindow = {
  minimize: async () => (await win()).minimize().catch(() => {}),
  toggleMaximize: async () => (await win()).toggleMaximize().catch(() => {}),
  close: async () => (await win()).close().catch(() => {}),
  hide: async () => (await win()).hide().catch(() => {}),
  isMaximized: async () => {
    try {
      return await (await win()).isMaximized();
    } catch {
      return false;
    }
  },
  /** Begin an OS resize drag from a frameless edge/corner grip. */
  startResize: async (dir: ResizeDirection) => {
    try {
      await (await win()).startResizeDragging(dir as never);
    } catch {
      /* ignore */
    }
  },
  /** Fires whenever the window is maximized/unmaximized/resized. */
  onResized: async (cb: () => void) => {
    try {
      return await (await win()).onResized(() => cb());
    } catch {
      return () => {};
    }
  },
};

export type ResizeDirection =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

/* ---------------- native integrations ---------------- */

/** Open a URL in the user's real browser instead of hijacking the app window. */
export async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    try {
      window.open(url, "_blank", "noopener");
    } catch {
      /* ignore */
    }
  }
}

/** Post a real OS notification (tray/action-center), requesting permission once. */
export async function nativeNotify(title: string, body?: string): Promise<void> {
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === "granted";
    if (granted) n.sendNotification({ title, body });
  } catch {
    /* ignore */
  }
}

/** Listen for tray quick-actions emitted by the Rust shell. Returns an unlisten. */
export async function onTrayAction(cb: (action: string) => void): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<string>("ember-tray-action", (e) => cb(e.payload));
  } catch {
    return () => {};
  }
}

/* ---------------- launch at startup ---------------- */

export const autostart = {
  isEnabled: async (): Promise<boolean> => {
    try {
      const { isEnabled } = await import("@tauri-apps/plugin-autostart");
      return await isEnabled();
    } catch {
      return false;
    }
  },
  set: async (on: boolean): Promise<void> => {
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (on) await enable();
      else await disable();
    } catch {
      /* ignore */
    }
  },
};

/* ---------------- auto-update ---------------- */

export interface UpdateInfo {
  version: string;
  notes?: string;
  /** Kick off download+install, reporting 0..1 progress; then relaunch to apply. */
  install: (onProgress?: (fraction: number) => void) => Promise<void>;
}

/** Silent check. Resolves to update metadata, or null when already current. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body,
      install: async (onProgress) => {
        let total = 0;
        let got = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") total = event.data.contentLength ?? 0;
          else if (event.event === "Progress") {
            got += event.data.chunkLength;
            if (total > 0) onProgress?.(Math.min(1, got / total));
          } else if (event.event === "Finished") onProgress?.(1);
        });
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  } catch {
    return null;
  }
}

/** The running native shell version (from tauri.conf.json / package.json). */
export async function appVersion(): Promise<string> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "";
  }
}
