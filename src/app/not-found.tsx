"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import { useT } from "@/lib/i18n";
import { EASE } from "@/lib/motion";

/**
 * A missing route. Reachable in practice by an old bookmark, a synced link
 * from another device, or a page that has since been removed — /contacts, for
 * instance, which existed until recently.
 *
 * Deliberately not a dead end: the way back to the dashboard is the only
 * control on the page.
 */
export default function NotFound() {
  const t = useT();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE.out }}
      className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center"
    >
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/[0.06] text-muted">
        <Compass size={24} strokeWidth={1.8} />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">{t("nf.title")}</h1>
      <p className="mt-2 max-w-[40ch] text-[13.5px] leading-relaxed text-muted">{t("nf.body")}</p>

      <Link
        href="/"
        data-magnetic=""
        className="glow-brand glow-hover mt-6 flex h-10 items-center rounded-[11px] bg-[image:var(--grad-sunset)] px-5 text-sm font-semibold text-(--on-sunset) transition-[filter] hover:brightness-110"
      >
        {t("nf.home")}
      </Link>
    </motion.div>
  );
}
