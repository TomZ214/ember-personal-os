"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Flame, Keyboard, Languages, Link2, LocateFixed, Trash2 } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useBankStatus, useGoogleStatus } from "@/hooks/useIntegrations";
import { DataSync } from "@/components/settings/DataSync";
import { DesktopSettings } from "@/components/desktop/DesktopSettings";
import { Button } from "@/components/ui/Button";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { Input, Label } from "@/components/ui/inputs";
import { Kbd, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

export default function SettingsPage() {
  const hydrated = useHydrated();
  const settings = useEmber((s) => s.settings);
  const updateSettings = useEmber((s) => s.updateSettings);
  const [locating, setLocating] = useState(false);
  const t = useT();

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  const locate = () => {
    if (!navigator.geolocation) return toast(t("settings.geoUnavailable"), "info");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateSettings({
          latitude: Math.round(pos.coords.latitude * 100) / 100,
          longitude: Math.round(pos.coords.longitude * 100) / 100,
          place: t("settings.myLocation"),
        });
        sessionStorage.clear(); // drop weather cache
        setLocating(false);
        toast(t("settings.locationUpdated"));
      },
      () => {
        setLocating(false);
        toast(t("settings.locationFailed"), "info");
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("settings.title")} sub={t("settings.sub")} />

      <div className="flex flex-col gap-4">
        <DesktopSettings />

        <ConnectionsLink />

        <DataSync />

        <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Languages size={16} /> {t("settings.language")}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{t("settings.languageSub")}</p>
          </div>
          <LanguageToggle />
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 text-[15px] font-semibold">{t("settings.profile")}</h2>
          <label className="block max-w-xs">
            <Label>{t("settings.yourName")}</Label>
            <Input
              value={settings.userName}
              onChange={(e) => updateSettings({ userName: e.target.value })}
              placeholder={t("settings.namePlaceholder")}
            />
          </label>
        </section>

        <section className="panel p-5">
          <h2 className="mb-1 text-[15px] font-semibold">{t("settings.weatherLocation")}</h2>
          <p className="mb-4 text-[13px] text-muted">{t("settings.weatherLocationSub")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <Label>{t("settings.placeLabel")}</Label>
              <Input value={settings.place} onChange={(e) => updateSettings({ place: e.target.value })} className="w-40" />
            </label>
            <label>
              <Label>{t("settings.latitude")}</Label>
              <Input
                type="number" step="0.01" value={settings.latitude} className="w-28"
                onChange={(e) => updateSettings({ latitude: parseFloat(e.target.value) || 0 })}
              />
            </label>
            <label>
              <Label>{t("settings.longitude")}</Label>
              <Input
                type="number" step="0.01" value={settings.longitude} className="w-28"
                onChange={(e) => updateSettings({ longitude: parseFloat(e.target.value) || 0 })}
              />
            </label>
            <Button onClick={locate} disabled={locating}>
              <LocateFixed size={15} /> {locating ? t("settings.locating") : t("settings.useMyLocation")}
            </Button>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 text-[15px] font-semibold">{t("settings.focusTimer")}</h2>
          <div className="flex flex-wrap gap-3">
            <label>
              <Label>{t("settings.focusMinutes")}</Label>
              <Input
                type="number" min={5} max={120} value={settings.focusMinutes} className="w-28"
                onChange={(e) => updateSettings({ focusMinutes: Math.max(1, parseInt(e.target.value) || 25) })}
              />
            </label>
            <label>
              <Label>{t("settings.breakMinutes")}</Label>
              <Input
                type="number" min={1} max={60} value={settings.breakMinutes} className="w-28"
                onChange={(e) => updateSettings({ breakMinutes: Math.max(1, parseInt(e.target.value) || 5) })}
              />
            </label>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><Keyboard size={16} /> {t("settings.shortcuts")}</h2>
          <ul className="flex flex-col gap-2.5 text-sm text-muted">
            <li className="flex items-center justify-between">
              <span>{t("settings.scOpenPalette")}</span>
              <span className="flex gap-1"><Kbd>⌘/Ctrl</Kbd><Kbd>K</Kbd></span>
            </li>
            <li className="flex items-center justify-between">
              <span>{t("settings.scCloseDialog")}</span>
              <Kbd>esc</Kbd>
            </li>
            <li className="flex items-center justify-between">
              <span>{t("settings.scNavigate")}</span>
              <span className="flex gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd><Kbd>↵</Kbd></span>
            </li>
          </ul>
        </section>

        <section className="panel p-5">
          <h2 className="mb-1 text-[15px] font-semibold">{t("settings.data")}</h2>
          <p className="mb-4 text-[13px] text-muted">{t("settings.dataSub")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(t("settings.eraseConfirm"))) {
                  localStorage.clear();
                  indexedDB.deleteDatabase("ember-files");
                  location.reload();
                }
              }}
            >
              <Trash2 size={15} /> {t("settings.eraseEverything")}
            </Button>
          </div>
        </section>

        <footer className="flex items-center gap-2 px-1 py-4 text-xs text-faint">
          <Flame size={12} className="text-primary-bright" />
          {t("settings.footer")}
        </footer>
      </div>
    </div>
  );
}

function ConnectionsLink() {
  const google = useGoogleStatus();
  const bank = useBankStatus();
  const t = useT();
  const connectedCount = [google.data?.connected, bank.data?.connected].filter(Boolean).length;

  return (
    <Link href="/settings/connections" className="panel panel-hover flex items-center gap-4 p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent/12 text-accent">
        <Link2 size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{t("settings.connections")}</span>
        <span className="block text-[13px] text-muted">
          {connectedCount > 0
            ? `${connectedCount} ${connectedCount === 1 ? t("settings.service") : t("settings.services")} ${t("settings.connectionsConnected")}`
            : t("settings.connectionsLink")}
        </span>
      </span>
      <span className="flex items-center gap-2">
        {google.data?.connected && <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px_var(--success)]" />}
        {bank.data?.connected && <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px_var(--success)]" />}
        <ChevronRight size={17} className="text-faint" />
      </span>
    </Link>
  );
}
