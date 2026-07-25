"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Download, RefreshCw, Sparkles, X } from "lucide-react";
import {
  checkForUpdate,
  isDesktop,
  nativeNotify,
  onTrayAction,
  openExternal,
  useIsDesktop,
  type UpdateInfo,
} from "@/lib/desktop";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

/**
 * The desktop runtime layer. On the web this renders nothing but its children.
 * Inside Tauri it adds: browser-routing for external links, tray quick-actions,
 * and a VS-Code / Discord-style background auto-update flow.
 */
export function DesktopProvider({ children }: { children: React.ReactNode }) {
  const desktop = useIsDesktop();
  const router = useRouter();
  const t = useT();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  const runCheck = useCallback(
    async (announceNoUpdate: boolean) => {
      const u = await checkForUpdate();
      if (u) {
        setUpdate(u);
        void nativeNotify("EmberOS", `Version ${u.version} is ready to install.`);
      } else if (announceNoUpdate) {
        toast(t("desktop.upToDate"));
      }
    },
    [t],
  );

  // Open cross-origin links (Apple, GitHub, docs…) in the real browser.
  useEffect(() => {
    if (!isDesktop()) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!href) return;
      try {
        const url = new URL(href, location.href);
        const isHttp = url.protocol === "http:" || url.protocol === "https:";
        if (isHttp && url.origin !== location.origin) {
          e.preventDefault();
          void openExternal(url.href);
        }
      } catch {
        /* not a URL — let it be */
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [desktop]);

  // Tray quick-actions emitted from the Rust shell, plus an in-app "check now"
  // event so the Settings button can reuse this same update flow.
  useEffect(() => {
    if (!isDesktop()) return;
    let unlisten: (() => void) | undefined;
    onTrayAction((action) => {
      if (action === "tasks") router.push("/tasks");
      else if (action === "update") void runCheck(true);
    }).then((u) => (unlisten = u));
    const onManual = () => void runCheck(true);
    window.addEventListener("ember-check-update", onManual);
    return () => {
      unlisten?.();
      window.removeEventListener("ember-check-update", onManual);
    };
  }, [desktop, router, runCheck]);

  // Silent check shortly after launch, then quietly every 6 hours.
  useEffect(() => {
    if (!isDesktop()) return;
    const first = setTimeout(() => void runCheck(false), 3500);
    const interval = setInterval(() => void runCheck(false), 6 * 60 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [desktop, runCheck]);

  return (
    <>
      {children}
      <AnimatePresence>
        {desktop && update && (
          <UpdateBanner update={update} onDismiss={() => setUpdate(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

function UpdateBanner({ update, onDismiss }: { update: UpdateInfo; onDismiss: () => void }) {
  const t = useT();
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);

  const install = async () => {
    setInstalling(true);
    try {
      await update.install((f) => setProgress(f));
      // relaunch happens inside install(); if we're still here, it failed softly
    } catch {
      setInstalling(false);
      toast(t("desktop.updateFailed"), "error", "error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="glass-strong glass-edge fixed bottom-5 right-5 z-[2147483645] w-[330px] overflow-hidden rounded-2xl p-4 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.7)]"
      role="dialog"
      aria-label={t("desktop.updateTitle")}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-accent/15 text-accent shadow-[0_0_20px_-4px_var(--accent)]">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{t("desktop.updateTitle")}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
            {t("desktop.updateReady").replace("{version}", update.version)}
          </p>
        </div>
        {!installing && (
          <button
            onClick={onDismiss}
            aria-label={t("action.close")}
            className="rounded-lg p-1 text-faint transition-colors hover:bg-white/[0.08] hover:text-ink"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {installing ? (
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-faint">
            <span className="flex items-center gap-1.5">
              <Download size={11} className="animate-pulse" /> {t("desktop.downloading")}
            </span>
            <span className="num">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <motion.div
              className="h-full rounded-full bg-[image:var(--grad-sunset)]"
              animate={{ width: `${Math.max(4, progress * 100)}%` }}
              transition={{ type: "spring", stiffness: 90, damping: 20 }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3.5 flex justify-end gap-2">
          <button
            onClick={onDismiss}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            {t("desktop.later")}
          </button>
          <button
            onClick={install}
            className="flex items-center gap-1.5 rounded-full bg-[image:var(--grad-sunset)] px-3.5 py-1.5 text-[13px] font-semibold text-(--on-sunset) shadow-[0_2px_16px_-2px_var(--primary-glow)] transition-[filter] hover:brightness-110"
          >
            <RefreshCw size={13} /> {t("desktop.restartUpdate")}
          </button>
        </div>
      )}
    </motion.div>
  );
}
