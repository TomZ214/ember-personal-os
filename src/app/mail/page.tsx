"use client";

import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useGoogleStatus } from "@/hooks/useIntegrations";
import { useApi } from "@/hooks/useApi";
import type { ConnectionStatus } from "@/lib/integrations/types";
import { GmailApp, GMAIL_PROVIDER, ICLOUD_PROVIDER } from "@/components/mail/GmailApp";
import { LocalMail } from "@/components/mail/LocalMail";

const ACCOUNT_KEY = "ember-mail-account";

/**
 * Mail hosts every connected account as its own inbox: Gmail and iCloud get
 * a switcher when both are linked; with none, the local demo mailbox runs.
 */
export default function MailPage() {
  return (
    <Suspense>
      <MailSwitch />
    </Suspense>
  );
}

function MailSwitch() {
  const google = useGoogleStatus();
  const icloud = useApi<ConnectionStatus>("/api/icloud/status");
  const [choice, setChoice] = useState<"gmail" | "icloud">("gmail");

  useEffect(() => {
    const t = setTimeout(() => {
      const saved = localStorage.getItem(ACCOUNT_KEY);
      if (saved === "gmail" || saved === "icloud") setChoice(saved);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const pick = (a: "gmail" | "icloud") => {
    setChoice(a);
    localStorage.setItem(ACCOUNT_KEY, a);
  };

  if ((google.loading && !google.data) || (icloud.loading && !icloud.data)) {
    return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;
  }

  const accounts: ("gmail" | "icloud")[] = [];
  if (google.data?.connected) accounts.push("gmail");
  if (icloud.data?.connected) accounts.push("icloud");

  if (accounts.length === 0) return <LocalMail />;

  const active = accounts.includes(choice) ? choice : accounts[0];

  return (
    <div>
      {accounts.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <div className="flex rounded-[11px] border border-white/[0.08] bg-white/[0.04] p-0.5">
            {accounts.map((a) => {
              const on = active === a;
              const label = a === "gmail" ? "Gmail" : "iCloud";
              const address = a === "gmail" ? google.data?.account : icloud.data?.account;
              return (
                <button
                  key={a}
                  onClick={() => pick(a)}
                  aria-pressed={on}
                  title={address ?? label}
                  className={`relative h-9 rounded-[9px] px-4 text-[13px] font-medium transition-colors ${
                    on ? "text-ink" : "text-faint hover:text-muted"
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="mail-account"
                      className="absolute inset-0 rounded-[9px] bg-white/[0.09]"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative">{label}</span>
                </button>
              );
            })}
          </div>
          <span className="hidden truncate text-xs text-faint sm:block">
            {active === "gmail" ? google.data?.account : icloud.data?.account}
          </span>
        </div>
      )}
      {/* key forces a clean remount when switching accounts */}
      <GmailApp key={active} provider={active === "gmail" ? GMAIL_PROVIDER : ICLOUD_PROVIDER} />
    </div>
  );
}
