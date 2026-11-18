/**
 * Twitch, the official way: the embeddable player and chat Twitch offers to
 * other sites. They need to be told which site they are embedded in
 * (`parent`), which is simply the host the app runs on — the web app, a
 * deploy preview, the desktop app (which loads the web app) or localhost.
 */

/** Twitch user names: 3–25 letters, digits or underscores */
const LOGIN = /^[a-z0-9_]{3,25}$/;

/** a channel from whatever was typed or pasted: "Name", "@name", a twitch.tv link */
export function parseChannel(input: string): string | null {
  let s = input.trim().toLowerCase();
  const link = s.match(/twitch\.tv\/(?:popout\/)?([a-z0-9_]{3,25})(?:[/?#]|$)/);
  if (link) s = link[1];
  s = s.replace(/^@/, "");
  return LOGIN.test(s) ? s : null;
}

export function playerUrl(channel: string, host: string): string {
  const q = new URLSearchParams({ channel, parent: host, autoplay: "true", muted: "false" });
  return `https://player.twitch.tv/?${q}`;
}

export function chatUrl(channel: string, host: string, dark: boolean): string {
  const q = new URLSearchParams({ parent: host });
  if (dark) q.set("darkpopout", "");
  return `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?${q}`;
}

export interface TwitchSettings {
  /** favourite channels, in the order they were added */
  channels: string[];
  /** the channel last watched */
  last?: string;
  /** chat beside the player */
  chat?: boolean;
}

export const MAX_CHANNELS = 30;
