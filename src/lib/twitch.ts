/**
 * Twitch, the official way: the embeddable player and chat Twitch offers to
 * other sites. They need to be told which site they are embedded in
 * (`parent`), which is simply the host the app runs on — the web app, a
 * deploy preview, the desktop app (which loads the web app) or localhost.
 */

/** Twitch user names: 3–25 letters, digits or underscores */
const LOGIN = /^[a-z0-9_]{3,25}$/;

/** first path segments of twitch.tv links that are pages, not channels */
const RESERVED = new Set([
  "about", "bits", "clip", "clips", "directory", "downloads", "drops", "embed", "following", "friends", "inventory",
  "jobs", "login", "messages", "moderator", "p", "payments", "popout", "prime", "privacy", "products", "schedule",
  "search", "security", "settings", "signup", "store", "subscriptions", "team", "turbo", "u", "user", "videos", "wallet",
]);

/** a channel from whatever was typed or pasted: "Name", "@name", a twitch.tv link */
export function parseChannel(input: string): string | null {
  const s = input.trim().toLowerCase();
  const link = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/(?:popout\/)?([a-z0-9_]+)(?:[/?#]|$)/);
  let name: string;
  if (link) name = link[1];
  // some other link or address: not a channel
  else if (/[/.:]/.test(s)) return null;
  else name = s.replace(/^@/, "");
  return LOGIN.test(name) && !RESERVED.has(name) ? name : null;
}

/**
 * The player starts on its own, muted: iPhone and iPad only play video by
 * themselves without sound (with sound it would sit waiting for a tap). A tap
 * on the player's speaker turns the sound on.
 */
export function playerUrl(channel: string, host: string): string {
  const q = new URLSearchParams({ channel, parent: host, autoplay: "true", muted: "true" });
  return `https://player.twitch.tv/?${q}`;
}

export function chatUrl(channel: string, host: string, dark: boolean): string {
  const q = new URLSearchParams({ parent: host });
  if (dark) q.set("darkpopout", "");
  return `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?${q}`;
}

/** synced: the favourite channels, in the order they were added */
export interface TwitchSettings {
  channels: string[];
}

/**
 * Kept on this device only: what is playing here and whether the chat is
 * open. Synced, choosing a channel on the iPad would switch the stream
 * playing on the desktop.
 */
export interface TwitchHere {
  last?: string;
  chat: boolean;
}

const HERE_KEY = "ember-twitch-here";

export function readHere(): TwitchHere {
  try {
    const v = JSON.parse(localStorage.getItem(HERE_KEY) ?? "{}") as Partial<TwitchHere>;
    return { last: typeof v.last === "string" ? (parseChannel(v.last) ?? undefined) : undefined, chat: v.chat !== false };
  } catch {
    return { chat: true };
  }
}

export function writeHere(here: TwitchHere) {
  try {
    localStorage.setItem(HERE_KEY, JSON.stringify(here));
  } catch {}
}

export const MAX_CHANNELS = 30;
