"use client";

import { motion } from "framer-motion";
import { Heart, MessageCircle, Play, RefreshCw } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useApi } from "@/hooks/useApi";
import { dfLocale } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import { EASE } from "@/lib/motion";

interface FeedMedia {
  type: "photo" | "video" | "gif";
  poster: string;
  video?: string;
  alt?: string;
}

interface FeedPost {
  id: string;
  text: string;
  createdAt: string;
  isReply: boolean;
  isQuote: boolean;
  likes: number;
  replies: number;
  url: string;
  media: FeedMedia[];
}

interface Feed {
  configured: boolean;
  missing?: string[];
  handle: string;
  name?: string;
  avatar?: string;
  posts?: FeedPost[];
}

/** X strips its own t.co link off the end of a post that carries media. */
function clean(text: string) {
  return text.replace(/\s*https:\/\/t\.co\/\w+\s*$/, "").trim();
}

export function XFeedWidget() {
  // the server caches for 5 minutes, so polling more often than that only
  // costs a local round trip
  const { data, loading, refresh } = useApi<Feed>("/api/x", { refreshMs: 5 * 60_000 });
  const t = useT();
  const lang = useLang();

  const posts = data?.posts ?? [];

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {data?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar, no layout benefit from next/image here
            <img
              src={data.avatar}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[13px] font-semibold">
              𝕏
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">
              {data?.name ?? t("x.title")}
            </span>
            <span className="block truncate text-[11px] text-faint">
              @{data?.handle ?? "…"}
            </span>
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          aria-label={t("x.refresh")}
          className="-mx-1 -my-2 flex items-center gap-1.5 px-1 py-2 text-xs text-faint transition-colors hover:text-accent disabled:cursor-wait"
        >
          <motion.span
            animate={loading ? { rotate: 360 } : { rotate: 0 }}
            transition={loading ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.2 }}
            className="flex"
          >
            <RefreshCw size={12} />
          </motion.span>
        </button>
      </div>

      {data && !data.configured ? (
        <p className="text-[13px] leading-relaxed text-faint">{t("x.needsKey")}</p>
      ) : loading && posts.length === 0 ? (
        <div className="flex flex-col gap-3">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-28 w-full" style={{ borderRadius: 14 }} />
        </div>
      ) : posts.length === 0 ? (
        <p className="text-[13px] text-faint">{t("x.empty")}</p>
      ) : (
        <ul className="-mx-1 flex max-h-[26rem] flex-col gap-3 overflow-y-auto px-1">
          {posts.map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.2), ease: EASE.out }}
              className="border-b border-white/[0.05] pb-3 last:border-0 last:pb-0"
            >
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="group block">
                <div className="mb-1 flex items-center gap-2 text-[11px] text-faint">
                  {p.isReply && (
                    <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5">{t("x.reply")}</span>
                  )}
                  {p.isQuote && (
                    <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5">{t("x.quote")}</span>
                  )}
                  <span>
                    {formatDistanceToNow(parseISO(p.createdAt), {
                      addSuffix: true,
                      locale: dfLocale(lang),
                    })}
                  </span>
                </div>

                {clean(p.text) && (
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink/90 transition-colors group-hover:text-ink">
                    {clean(p.text)}
                  </p>
                )}

                {p.media.length > 0 && (
                  <div
                    className={`mt-2 grid gap-1.5 ${p.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
                  >
                    {p.media.map((m, mi) =>
                      m.video ? (
                        <video
                          key={mi}
                          src={m.video}
                          poster={m.poster}
                          controls
                          playsInline
                          preload="none"
                          // the card is a link; without this a tap on the
                          // controls would navigate to X instead of playing
                          onClick={(e) => e.preventDefault()}
                          className="max-h-64 w-full rounded-xl bg-black object-cover"
                        />
                      ) : (
                        <span key={mi} className="relative block overflow-hidden rounded-xl">
                          {/* eslint-disable-next-line @next/next/no-img-element -- remote media, dimensions unknown ahead of time */}
                          <img
                            src={m.poster}
                            alt={m.alt ?? ""}
                            loading="lazy"
                            className="max-h-64 w-full object-cover"
                          />
                          {m.type === "gif" && (
                            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium">
                              <Play size={9} /> GIF
                            </span>
                          )}
                        </span>
                      ),
                    )}
                  </div>
                )}

                <div className="mt-1.5 flex items-center gap-4 text-[11px] text-faint">
                  <span className="flex items-center gap-1">
                    <Heart size={11} /> {p.likes.toLocaleString(lang === "de" ? "de-DE" : "en-GB")}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle size={11} />{" "}
                    {p.replies.toLocaleString(lang === "de" ? "de-DE" : "en-GB")}
                  </span>
                </div>
              </a>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
