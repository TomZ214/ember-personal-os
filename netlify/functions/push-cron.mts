/**
 * Netlify's scheduler can't call a Next.js route directly, so this thin
 * function does — every 15 minutes. All the logic lives in /api/cron/push;
 * this only carries the shared secret so the endpoint can't be triggered
 * by anyone else.
 */
export default async function handler(): Promise<Response> {
  const base = process.env.URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error("[push-cron] missing URL or CRON_SECRET");
    return new Response("not configured", { status: 503 });
  }

  const res = await fetch(`${base}/api/cron/push`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log("[push-cron]", res.status, body);
  return new Response(body, { status: res.status });
}

/** Netlify reads this to register the cron schedule */
export const config = {
  schedule: "*/15 * * * *",
};
