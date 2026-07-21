import { NextResponse } from "next/server";

/**
 * One person's X timeline — posts and replies, with whatever media they
 * carry. Read-only and public: no account of yours is involved, the token is
 * an app-only bearer token that never reaches the browser.
 *
 * "Only his" means retweets are excluded; replies are kept, which is exactly
 * what the X API does by default with `exclude=retweets`.
 *
 * Requires X_BEARER_TOKEN. Note that reading another account's timeline is NOT
 * in X's free API tier — it needs Basic or above. Without a token the route
 * reports itself unconfigured and the widget says so rather than failing.
 */

export const maxDuration = 20;

const HANDLE = process.env.X_HANDLE ?? "TheNotoriousMMA";
const API = "https://api.x.com/2";

/** X rate limits are tight, so a timeline is served from memory for a while. */
const TTL_MS = 5 * 60_000;
/** A handle's numeric id never changes, so it is worth holding onto for longer. */
const ID_TTL_MS = 24 * 60 * 60_000;

interface XMedia {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
  variants?: { bit_rate?: number; content_type: string; url: string }[];
}

interface XPost {
  id: string;
  text: string;
  created_at: string;
  attachments?: { media_keys?: string[] };
  referenced_tweets?: { type: "replied_to" | "quoted" | "retweeted"; id: string }[];
  public_metrics?: { like_count: number; reply_count: number; repost_count?: number; retweet_count?: number };
}

/** what the client actually gets — a flat shape with the media already resolved */
export interface FeedPost {
  id: string;
  text: string;
  createdAt: string;
  isReply: boolean;
  isQuote: boolean;
  likes: number;
  replies: number;
  url: string;
  media: { type: "photo" | "video" | "gif"; poster: string; video?: string; alt?: string }[];
}

let idCache: { handle: string; id: string; name: string; avatar?: string; at: number } | null = null;
let feedCache: { at: number; body: unknown } | null = null;

function auth(): HeadersInit {
  return { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` };
}

async function resolveUser() {
  if (idCache && idCache.handle === HANDLE && Date.now() - idCache.at < ID_TTL_MS) return idCache;
  const res = await fetch(
    `${API}/users/by/username/${encodeURIComponent(HANDLE)}?user.fields=profile_image_url,name`,
    { headers: auth(), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`X user lookup failed (${res.status})`);
  const body = await res.json();
  if (!body?.data?.id) throw new Error(`No such account: @${HANDLE}`);
  idCache = {
    handle: HANDLE,
    id: body.data.id,
    name: body.data.name,
    // the default avatar comes back at 48px; _400x400 is the same file, bigger
    avatar: body.data.profile_image_url?.replace("_normal", "_400x400"),
    at: Date.now(),
  };
  return idCache;
}

/** pick the best mp4 X offers for a video; it also serves HLS, which <video> won't play everywhere */
function bestVideo(m: XMedia): string | undefined {
  const mp4s = (m.variants ?? []).filter((v) => v.content_type === "video/mp4");
  if (mp4s.length === 0) return undefined;
  return mp4s.sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0].url;
}

export async function GET() {
  if (!process.env.X_BEARER_TOKEN) {
    return NextResponse.json({ configured: false, missing: ["X_BEARER_TOKEN"], handle: HANDLE });
  }

  if (feedCache && Date.now() - feedCache.at < TTL_MS) {
    return NextResponse.json(feedCache.body);
  }

  try {
    const user = await resolveUser();
    const params = new URLSearchParams({
      max_results: "20",
      // his own posts and replies, but not things he merely reposted
      exclude: "retweets",
      "tweet.fields": "created_at,public_metrics,referenced_tweets",
      expansions: "attachments.media_keys",
      "media.fields": "type,url,preview_image_url,variants,alt_text",
    });
    const res = await fetch(`${API}/users/${user.id}/tweets?${params}`, {
      headers: auth(),
      cache: "no-store",
    });

    if (res.status === 429) {
      // serve something stale rather than an error if we have it
      if (feedCache) return NextResponse.json(feedCache.body);
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[x]", res.status, detail.slice(0, 300));
      return NextResponse.json({ error: `X request failed (${res.status})` }, { status: 502 });
    }

    const body = await res.json();
    const mediaByKey = new Map<string, XMedia>(
      (body.includes?.media ?? []).map((m: XMedia) => [m.media_key, m]),
    );

    const posts: FeedPost[] = (body.data ?? []).map((p: XPost) => {
      const refs = p.referenced_tweets ?? [];
      const media = (p.attachments?.media_keys ?? [])
        .map((k) => mediaByKey.get(k))
        .filter((m): m is XMedia => !!m)
        .map((m) => ({
          type: m.type === "animated_gif" ? ("gif" as const) : (m.type as "photo" | "video"),
          poster: m.url ?? m.preview_image_url ?? "",
          video: m.type === "photo" ? undefined : bestVideo(m),
          alt: m.alt_text,
        }))
        .filter((m) => m.poster);

      return {
        id: p.id,
        text: p.text,
        createdAt: p.created_at,
        isReply: refs.some((r) => r.type === "replied_to"),
        isQuote: refs.some((r) => r.type === "quoted"),
        likes: p.public_metrics?.like_count ?? 0,
        replies: p.public_metrics?.reply_count ?? 0,
        url: `https://x.com/${HANDLE}/status/${p.id}`,
        media,
      };
    });

    const payload = {
      configured: true,
      handle: HANDLE,
      name: user.name,
      avatar: user.avatar,
      posts,
      fetchedAt: new Date().toISOString(),
    };
    feedCache = { at: Date.now(), body: payload };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[x]", e);
    if (feedCache) return NextResponse.json(feedCache.body);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "x_error" },
      { status: 502 },
    );
  }
}
