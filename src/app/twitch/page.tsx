"use client";

import { useState, useSyncExternalStore } from "react";
import { ExternalLink, MessageSquare, MessageSquareOff, Plus, RotateCw, Star, Tv, X } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { chatUrl, MAX_CHANNELS, parseChannel, playerUrl, readHere, writeHere, type TwitchHere } from "@/lib/twitch";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

/**
 * Twitch in a tab: the official player and chat, a channel box, and a row
 * of favourites that travels with the cloud sync.
 */

/** one shared empty list: a store selector must not hand back a new [] each time */
const NO_CHANNELS: string[] = [];

const noop = () => () => {};
/** the host Twitch must be told it is embedded in */
const useHost = () => useSyncExternalStore(noop, () => window.location.hostname, () => "");

const DARK = "(prefers-color-scheme: dark)";
const subscribeScheme = (cb: () => void) => {
  const m = window.matchMedia(DARK);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
/** the chat in the app's light or dark, "system" included */
function useDark() {
  const appearance = useEmber((s) => s.settings.appearance ?? "dark");
  const system = useSyncExternalStore(subscribeScheme, () => window.matchMedia(DARK).matches, () => true);
  return appearance === "dark" || (appearance === "system" && system);
}

export default function TwitchPage() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;
  return <TwitchRoom />;
}

function TwitchRoom() {
  const t = useT();
  const host = useHost();
  const channels = useEmber((s) => s.settings.twitch?.channels ?? NO_CHANNELS);
  const dark = useDark();
  const updateSettings = useEmber((s) => s.updateSettings);
  const [here, setHereState] = useState<TwitchHere>(readHere);
  const channel = here.last;
  const [draft, setDraft] = useState("");
  // bumped by "reload": a fresh player and chat
  const [reload, setReload] = useState(0);

  const setHere = (patch: Partial<TwitchHere>) => {
    const next = { ...here, ...patch };
    setHereState(next);
    writeHere(next);
  };
  const watch = (c: string) => setHere({ last: c });
  const isFav = !!channel && channels.includes(channel);
  // read the newest list at the moment of the change, so two quick taps never lose one
  const toggleFav = (c: string) => {
    const now = useEmber.getState().settings.twitch?.channels ?? [];
    updateSettings({ twitch: { channels: now.includes(c) ? now.filter((x) => x !== c) : [...now, c].slice(-MAX_CHANNELS) } });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = parseChannel(draft);
    if (!c) return toast(t("tw.invalid"), "error");
    watch(c);
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Twitch" sub={t("tw.sub")} />

      <form onSubmit={submit} className="mb-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("tw.placeholder")}
          aria-label={t("tw.channel")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="primary" disabled={!draft.trim()}>
          {t("tw.watch")}
        </Button>
      </form>

      {channels.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-1.5" aria-label={t("tw.favourites")}>
          {channels.map((c) => (
            <li key={c} className="flex items-center">
              <button
                type="button"
                onClick={() => watch(c)}
                aria-current={c === channel ? "true" : undefined}
                className={`h-8 rounded-l-full border border-r-0 pl-3 pr-2 text-[13px] [--press-scale:0.96] ${
                  c === channel ? "border-accent/60 bg-accent/15 text-ink" : "border-white/[0.1] text-muted hover:text-ink"
                }`}
              >
                {c}
              </button>
              <button
                type="button"
                onClick={() => toggleFav(c)}
                aria-label={t("tw.remove").replace("{name}", c)}
                className={`flex h-8 w-7 items-center justify-center rounded-r-full border border-l-0 text-faint hover:text-ink ${
                  c === channel ? "border-accent/60 bg-accent/15" : "border-white/[0.1]"
                }`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!channel || !host ? (
        <section className="panel p-6">
          <EmptyState icon={<Tv />} title={t("tw.empty")} hint={t("tw.emptySub")} />
        </section>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${here.chat ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
          <section aria-label={t("tw.player")}>
            {/* Not inside a glass pane: Safari can leave an embedded page
                blank under a backdrop blur. A plain black frame instead. */}
            <div className="relative aspect-video w-full overflow-hidden rounded-[18px] bg-black ring-1 ring-white/[0.1]">
              <iframe
                key={`${channel}-player-${reload}`}
                src={playerUrl(channel, host)}
                title={`Twitch: ${channel}`}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-3">
              <p className="min-w-0 truncate text-[15px] font-semibold">{channel}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setReload((n) => n + 1)}>
                  <RotateCw size={14} /> {t("tw.reload")}
                </Button>
                <a
                  href={`https://www.twitch.tv/${encodeURIComponent(channel)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium text-muted hover:bg-white/[0.06] hover:text-ink"
                >
                  <ExternalLink size={14} /> {t("tw.open")}
                </a>
                <Button size="sm" variant={isFav ? "subtle" : "ghost"} onClick={() => toggleFav(channel)} aria-pressed={isFav}>
                  {isFav ? <Star size={14} className="fill-current text-accent" /> : <Plus size={14} />}
                  {isFav ? t("tw.favourite") : t("tw.addFavourite")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setHere({ chat: !here.chat })} aria-pressed={!!here.chat}>
                  {here.chat ? <MessageSquareOff size={14} /> : <MessageSquare size={14} />}
                  {here.chat ? t("tw.hideChat") : t("tw.showChat")}
                </Button>
              </div>
            </div>
          </section>

          {here.chat && (
            <section
              className="h-[520px] overflow-hidden rounded-[18px] bg-[#18181b] ring-1 ring-white/[0.1] lg:h-auto lg:min-h-[480px]"
              aria-label={t("tw.chat")}
            >
              <iframe
                key={`${channel}-chat-${dark}-${reload}`}
                src={chatUrl(channel, host, dark)}
                title={`Twitch Chat: ${channel}`}
                className="h-full w-full border-0"
              />
            </section>
          )}
        </div>
      )}

      <p className="mt-4 max-w-[70ch] text-[12px] leading-relaxed text-faint">{t("tw.ads")}</p>
    </div>
  );
}
