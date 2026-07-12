"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Flame, Keyboard, Link2, LocateFixed, Trash2 } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useBankStatus, useGoogleStatus } from "@/hooks/useIntegrations";
import { DataSync } from "@/components/settings/DataSync";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/inputs";
import { Kbd, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

export default function SettingsPage() {
  const hydrated = useHydrated();
  const settings = useEmber((s) => s.settings);
  const updateSettings = useEmber((s) => s.updateSettings);
  const [locating, setLocating] = useState(false);

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  const locate = () => {
    if (!navigator.geolocation) return toast("Geolocation not available", "info");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateSettings({
          latitude: Math.round(pos.coords.latitude * 100) / 100,
          longitude: Math.round(pos.coords.longitude * 100) / 100,
          place: "My location",
        });
        sessionStorage.clear(); // drop weather cache
        setLocating(false);
        toast("Location updated — weather follows you now");
      },
      () => {
        setLocating(false);
        toast("Couldn't get your location", "info");
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" sub="Your data stays on this device unless you connect a service" />

      <div className="flex flex-col gap-4">
        <ConnectionsLink />

        <DataSync />

        <section className="panel p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Profile</h2>
          <label className="block max-w-xs">
            <Label>Your name</Label>
            <Input
              value={settings.userName}
              onChange={(e) => updateSettings({ userName: e.target.value })}
              placeholder="How should Ember greet you?"
            />
          </label>
        </section>

        <section className="panel p-5">
          <h2 className="mb-1 text-[15px] font-semibold">Weather location</h2>
          <p className="mb-4 text-[13px] text-muted">Used by the dashboard weather widget (Open-Meteo, no account needed).</p>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <Label>Place label</Label>
              <Input value={settings.place} onChange={(e) => updateSettings({ place: e.target.value })} className="w-40" />
            </label>
            <label>
              <Label>Latitude</Label>
              <Input
                type="number" step="0.01" value={settings.latitude} className="w-28"
                onChange={(e) => updateSettings({ latitude: parseFloat(e.target.value) || 0 })}
              />
            </label>
            <label>
              <Label>Longitude</Label>
              <Input
                type="number" step="0.01" value={settings.longitude} className="w-28"
                onChange={(e) => updateSettings({ longitude: parseFloat(e.target.value) || 0 })}
              />
            </label>
            <Button onClick={locate} disabled={locating}>
              <LocateFixed size={15} /> {locating ? "Locating…" : "Use my location"}
            </Button>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Focus timer</h2>
          <div className="flex flex-wrap gap-3">
            <label>
              <Label>Focus (minutes)</Label>
              <Input
                type="number" min={5} max={120} value={settings.focusMinutes} className="w-28"
                onChange={(e) => updateSettings({ focusMinutes: Math.max(1, parseInt(e.target.value) || 25) })}
              />
            </label>
            <label>
              <Label>Break (minutes)</Label>
              <Input
                type="number" min={1} max={60} value={settings.breakMinutes} className="w-28"
                onChange={(e) => updateSettings({ breakMinutes: Math.max(1, parseInt(e.target.value) || 5) })}
              />
            </label>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><Keyboard size={16} /> Keyboard shortcuts</h2>
          <ul className="flex flex-col gap-2.5 text-sm text-muted">
            <li className="flex items-center justify-between">
              <span>Open command palette (search, create, navigate)</span>
              <span className="flex gap-1"><Kbd>⌘/Ctrl</Kbd><Kbd>K</Kbd></span>
            </li>
            <li className="flex items-center justify-between">
              <span>Close any dialog</span>
              <Kbd>esc</Kbd>
            </li>
            <li className="flex items-center justify-between">
              <span>Navigate palette results</span>
              <span className="flex gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd><Kbd>↵</Kbd></span>
            </li>
          </ul>
        </section>

        <section className="panel p-5">
          <h2 className="mb-1 text-[15px] font-semibold">Data</h2>
          <p className="mb-4 text-[13px] text-muted">
            Everything lives in your browser: localStorage for data, IndexedDB for files, an encrypted blob for the vault.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("Erase ALL Ember data on this device? The vault is deleted too. This cannot be undone.")) {
                  localStorage.clear();
                  indexedDB.deleteDatabase("ember-files");
                  location.reload();
                }
              }}
            >
              <Trash2 size={15} /> Erase everything
            </Button>
          </div>
        </section>

        <footer className="flex items-center gap-2 px-1 py-4 text-xs text-faint">
          <Flame size={12} className="text-primary-bright" />
          Ember — your personal OS. Local-first, private by default.
        </footer>
      </div>
    </div>
  );
}

function ConnectionsLink() {
  const google = useGoogleStatus();
  const bank = useBankStatus();
  const connectedCount = [google.data?.connected, bank.data?.connected].filter(Boolean).length;

  return (
    <Link href="/settings/connections" className="panel panel-hover flex items-center gap-4 p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent/12 text-accent">
        <Link2 size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Connections</span>
        <span className="block text-[13px] text-muted">
          {connectedCount > 0
            ? `${connectedCount} service${connectedCount === 1 ? "" : "s"} connected — Google & bank sync`
            : "Link Google (Calendar · Gmail · Contacts) and your bank"}
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
