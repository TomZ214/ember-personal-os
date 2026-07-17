"use client";

import { useEffect, useState } from "react";
import { Monitor, Power, RefreshCw } from "lucide-react";
import { appVersion, autostart, useIsDesktop } from "@/lib/desktop";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

/**
 * Settings → "Desktop app" panel. Renders only inside the native shell, so on
 * the web it's invisible and adds nothing to the page.
 */
export function DesktopSettings() {
  const desktop = useIsDesktop();
  const t = useT();
  const [version, setVersion] = useState("");
  const [startup, setStartup] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    appVersion().then(setVersion);
    autostart.isEnabled().then(setStartup);
  }, [desktop]);

  if (!desktop) return null;

  const toggleStartup = async () => {
    const next = !startup;
    setStartup(next);
    await autostart.set(next);
  };

  const checkUpdates = () => {
    setChecking(true);
    window.dispatchEvent(new Event("ember-check-update"));
    setTimeout(() => setChecking(false), 2500);
  };

  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <Monitor size={16} /> {t("desktop.section")}
        {version && (
          <span className="ml-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-faint">
            {t("desktop.version").replace("{v}", version)}
          </span>
        )}
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">{t("desktop.sectionSub")}</p>

      <div className="mt-4 flex flex-col divide-y divide-white/[0.06]">
        <label className="flex cursor-pointer items-center gap-3 py-3">
          <Power size={15} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">{t("desktop.launchAtStartup")}</span>
            <span className="block text-xs text-faint">{t("desktop.launchAtStartupSub")}</span>
          </span>
          <input
            type="checkbox"
            checked={startup}
            onChange={toggleStartup}
            className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            aria-label={t("desktop.launchAtStartup")}
          />
        </label>

        <div className="flex items-center gap-3 py-3">
          <RefreshCw size={15} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 text-[13px] font-medium">{t("desktop.checkUpdates")}</span>
          <Button size="sm" onClick={checkUpdates} disabled={checking}>
            {checking ? t("desktop.checking") : t("desktop.checkUpdates")}
          </Button>
        </div>
      </div>
    </section>
  );
}
