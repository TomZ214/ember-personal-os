"use client";

import { useState, useSyncExternalStore } from "react";
import { MessageSquare, MessageSquareOff, Plus, Star, Tv, X } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { chatUrl, MAX_CHANNELS, parseChannel, playerUrl, type TwitchSettings } from "@/lib/twitch";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

/**
 * Twitch in a tab: the official player and chat, a channel box, and a row
 * of favourites that travels with the cloud sync.
 */

const noop = () => () => {};
/** the host Twitch must be told it is embedded in */
const useHost = () => useSyncExternalStore(noop, () => window.location.hostname, () => "");

export default function TwitchPage() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;
  return <TwitchRoom />;
}

function TwitchRoom() {
  const t = useT();
  const host = useHost();
  const saved = useEmber((s) => s.settings.twitch);
  const dark = useEmber((s) => s.settings.appearance !== "light");
  const updateSettings = useEmber((s) => s.updateSettings);
  const tw: TwitchSettings = { channels: [], chat: true, ...saved };
  const channel = tw.last;
  const [draft, setDraft] = useState("");

  const save = (patch: Partial<TwitchSettings>) => updateSettings({ twitch: { ...tw, ...patch } });
  const watch = (c: string) => save({ last: c });
  const isFav = !!channel && tw.channels.includes(channel);
  const toggleFav = (c: string) =>
    save({
      channels: tw.channels.includes(c) ? tw.channels.filter((x) => x !== c) : [...tw.channels, c].slice(-MAX_CHANNELS),
    });

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

      {tw.channels.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-1.5" aria-label={t("tw.favourites")}>
          {tw.channels.map((c) => (
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
        <div className={`grid grid-cols-1 gap-4 ${tw.chat ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
          <section className="panel overflow-hidden p-0" aria-label={t("tw.player")}>
            <div className="relative aspect-video w-full bg-black">
              <iframe
                key={`${channel}-player`}
                src={playerUrl(channel, host)}
                title={`Twitch: ${channel}`}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="min-w-0 truncate text-[15px] font-semibold">{channel}</p>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant={isFav ? "subtle" : "ghost"} onClick={() => toggleFav(channel)} aria-pressed={isFav}>
                  {isFav ? <Star size={14} className="fill-current text-accent" /> : <Plus size={14} />}
                  {isFav ? t("tw.favourite") : t("tw.addFavourite")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => save({ chat: !tw.chat })} aria-pressed={!!tw.chat}>
                  {tw.chat ? <MessageSquareOff size={14} /> : <MessageSquare size={14} />}
                  {tw.chat ? t("tw.hideChat") : t("tw.showChat")}
                </Button>
              </div>
            </div>
          </section>

          {tw.chat && (
            <section className="panel h-[520px] overflow-hidden p-0 lg:h-auto lg:min-h-[480px]" aria-label={t("tw.chat")}>
              <iframe
                key={`${channel}-chat-${dark}`}
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
