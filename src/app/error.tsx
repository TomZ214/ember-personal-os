"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { RotateCw, TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n";
import { EASE } from "@/lib/motion";

/**
 * What the user sees when a page throws.
 *
 * Without this file they get Next's default error screen — a stack trace on
 * white — which is the single most jarring thing an app can show. This keeps
 * them inside EmberOS: same surface, same type, one obvious way forward.
 *
 * `unstable_retry` re-fetches and re-renders the segment. The older `reset`
 * only clears the error state without re-fetching, which usually just throws
 * again; this Next version wants retry.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // no reporting service wired up — the console is where this is findable
    console.error("[ember]", error);
  }, [error]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE.out }}
      className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center"
    >
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] bg-warning/12 text-warning">
        <TriangleAlert size={24} strokeWidth={1.8} />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">{t("err.title")}</h1>
      <p className="mt-2 max-w-[42ch] text-[13px] leading-relaxed text-muted">
        {t("err.body")}
      </p>

      <button
        onClick={() => unstable_retry()}
        className="glow-brand glow-hover mt-6 flex h-10 items-center gap-2 rounded-[11px] bg-[image:var(--grad-sunset)] px-5 text-sm font-semibold text-(--on-sunset) transition-[filter] hover:brightness-110"
        data-magnetic=""
      >
        <RotateCw size={15} /> {t("err.retry")}
      </button>

      {/* The digest is the only handle on a production error, where the real
          message is stripped. Small and selectable rather than hidden — if
          something is reproducible, this is what identifies it. */}
      {error.digest && (
        <p className="num mt-6 select-all text-[11px] text-faint">{error.digest}</p>
      )}
    </motion.div>
  );
}
