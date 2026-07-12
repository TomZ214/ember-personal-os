import "server-only";
import { googleFetch, googleJson, googlePool } from "./google";
import type { GmailBox, GmailDetail, GmailHeader, GmailSendInput } from "@/lib/integrations/types";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/* ---------- listing ---------- */

const BOX_QUERY: Record<GmailBox, { labelIds?: string; q?: string }> = {
  inbox: { labelIds: "INBOX" },
  starred: { labelIds: "STARRED" },
  sent: { labelIds: "SENT" },
  drafts: { labelIds: "DRAFT" },
  archive: { q: "-in:inbox -in:sent -in:drafts -in:trash -in:spam" },
  trash: { labelIds: "TRASH" },
  spam: { labelIds: "SPAM" },
};

interface RawHeaderMsg {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[]; parts?: RawPart[]; filename?: string };
}

function header(msg: RawHeaderMsg, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFrom(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2], email: m[2] };
  return { name: v, email: v };
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");

function mapHeader(msg: RawHeaderMsg): GmailHeader {
  const from = parseFrom(header(msg, "From"));
  const labels = msg.labelIds ?? [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: from.name,
    fromEmail: from.email,
    subject: header(msg, "Subject") || "(no subject)",
    snippet: decodeEntities(msg.snippet ?? ""),
    date: new Date(parseInt(msg.internalDate ?? "0")).toISOString(),
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    labels,
    hasAttachments: false, // filled from detail; metadata fetch can't tell reliably
  };
}

export async function listMessages(box: GmailBox, query: string): Promise<{ messages: GmailHeader[]; unreadInbox: number }> {
  const params = new URLSearchParams({ maxResults: "25" });
  const boxDef = BOX_QUERY[box];
  const q = [boxDef.q, query].filter(Boolean).join(" ");
  if (boxDef.labelIds && !query) params.set("labelIds", boxDef.labelIds);
  else if (boxDef.labelIds && query) params.set("q", `${query} label:${boxDef.labelIds.toLowerCase()}`);
  if (q && !boxDef.labelIds) params.set("q", q);
  if (box === "trash" || box === "spam") params.set("includeSpamTrash", "true");

  const [list, inboxLabel] = await Promise.all([
    googleJson<{ messages?: { id: string }[] }>(`${BASE}/messages?${params}`),
    googleJson<{ messagesUnread?: number }>(`${BASE}/labels/INBOX`),
  ]);

  const ids = (list.messages ?? []).map((m) => m.id);
  // bounded concurrency — fresh Google Cloud projects reject parallel bursts
  const details = await googlePool(ids, 5, (id) =>
    googleJson<RawHeaderMsg>(
      `${BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    ),
  );
  return { messages: details.map(mapHeader), unreadInbox: inboxLabel.messagesUnread ?? 0 };
}

/* ---------- detail ---------- */

interface RawPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: RawPart[];
}

const b64urlDecode = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function walkParts(part: RawPart | undefined, out: { plain: string[]; html: string[]; atts: GmailDetail["attachments"] }) {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    out.atts.push({
      id: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    out.plain.push(b64urlDecode(part.body.data));
  } else if (part.mimeType === "text/html" && part.body?.data) {
    out.html.push(b64urlDecode(part.body.data));
  }
  part.parts?.forEach((p) => walkParts(p, out));
}

/** crude but safe: html -> readable plain text */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getMessage(id: string): Promise<GmailDetail> {
  const msg = await googleJson<RawHeaderMsg>(`${BASE}/messages/${id}?format=full`);
  const out = { plain: [] as string[], html: [] as string[], atts: [] as GmailDetail["attachments"] };
  walkParts(msg.payload as RawPart, out);
  const body = out.plain.length ? out.plain.join("\n") : htmlToText(out.html.join("\n"));
  return {
    ...mapHeader(msg),
    to: header(msg, "To"),
    body: body || decodeEntities(msg.snippet ?? ""),
    attachments: out.atts.map((a) => ({
      ...a,
      url: `/api/google/gmail/attachment?messageId=${id}&attachmentId=${encodeURIComponent(a.id)}&filename=${encodeURIComponent(a.filename)}&mimeType=${encodeURIComponent(a.mimeType)}`,
    })),
    hasAttachments: out.atts.length > 0,
    messageIdHeader: header(msg, "Message-ID") || undefined,
  };
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const data = await googleJson<{ data: string }>(
    `${BASE}/messages/${messageId}/attachments/${attachmentId}`,
  );
  return Buffer.from(data.data, "base64url");
}

/* ---------- actions ---------- */

export type GmailAction = "read" | "unread" | "star" | "unstar" | "archive" | "unarchive" | "trash" | "untrash" | "spam";

export async function modifyMessage(id: string, action: GmailAction): Promise<void> {
  if (action === "trash" || action === "untrash") {
    await googleJson(`${BASE}/messages/${id}/${action}`, { method: "POST" });
    return;
  }
  const map: Record<Exclude<GmailAction, "trash" | "untrash">, { add?: string[]; remove?: string[] }> = {
    read: { remove: ["UNREAD"] },
    unread: { add: ["UNREAD"] },
    star: { add: ["STARRED"] },
    unstar: { remove: ["STARRED"] },
    archive: { remove: ["INBOX"] },
    unarchive: { add: ["INBOX"] },
    spam: { add: ["SPAM"], remove: ["INBOX"] },
  };
  const { add, remove } = map[action];
  await googleJson(`${BASE}/messages/${id}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: add ?? [], removeLabelIds: remove ?? [] }),
  });
}

/** collect up to `max` message ids for a query, paginating; only requests id fields */
async function collectIds(params: Record<string, string>, max: number): Promise<{ ids: string[]; more: boolean }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({
      ...params,
      maxResults: String(Math.min(500, max - ids.length)),
      fields: "messages/id,nextPageToken",
    });
    if (pageToken) p.set("pageToken", pageToken);
    const page = await googleJson<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `${BASE}/messages?${p}`,
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);
  return { ids, more: !!pageToken };
}

/**
 * One "read all" iteration: marks up to 1000 unread inbox messages as read
 * (batchModify's per-call ceiling). The client loops until `remaining` is 0 —
 * that way mailboxes with tens of thousands of unread mails work, progress is
 * reportable, and no serverless timeout is ever hit.
 */
export async function markAllReadBatch(): Promise<{ marked: number; remaining: number }> {
  const { ids } = await collectIds({ labelIds: "UNREAD", q: "in:inbox" }, 1000);
  if (ids.length > 0) {
    await googleJson(`${BASE}/messages/batchModify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, removeLabelIds: ["UNREAD"] }),
    });
  }
  const label = await googleJson<{ messagesUnread?: number }>(`${BASE}/labels/INBOX?fields=messagesUnread`);
  return { marked: ids.length, remaining: label.messagesUnread ?? 0 };
}

/* ---------- cleanup (delete old mail) ---------- */

export interface CleanupOptions {
  /** delete mail strictly older than this day, yyyy-MM-dd */
  before: string;
  /** searched scopes */
  include: ("inbox" | "promotions" | "social" | "updates" | "spam")[];
  /** label names to exclude (starred + important are always excluded) */
  excludeLabels: string[];
}

const SCOPE_QUERY: Record<CleanupOptions["include"][number], string> = {
  inbox: "in:inbox",
  promotions: "category:promotions",
  social: "category:social",
  updates: "category:updates",
  spam: "in:spam",
};

export function buildCleanupQuery(opts: CleanupOptions): string {
  const scopes = opts.include.map((s) => SCOPE_QUERY[s]).join(" OR ");
  const excludes = opts.excludeLabels
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `-label:"${l.replace(/"/g, "")}"`)
    .join(" ");
  return [
    `before:${opts.before.replaceAll("-", "/")}`,
    "-is:starred",
    "-is:important",
    excludes,
    scopes ? `{${scopes}}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Estimate scope of a cleanup: Gmail's own result estimate for the count,
 * plus the average size of a 25-message sample for the storage figure.
 */
export async function cleanupPreview(opts: CleanupOptions): Promise<{ count: number; avgBytes: number }> {
  const q = buildCleanupQuery(opts);
  const est = await googleJson<{ resultSizeEstimate?: number }>(
    `${BASE}/messages?${new URLSearchParams({ q, includeSpamTrash: "true", maxResults: "1", fields: "resultSizeEstimate" })}`,
  );
  const count = est.resultSizeEstimate ?? 0;
  if (count === 0) return { count: 0, avgBytes: 0 };

  const { ids } = await collectIds({ q, includeSpamTrash: "true" }, 25);
  const sizes = await googlePool(ids, 5, async (id) => {
    const m = await googleJson<{ sizeEstimate?: number }>(
      `${BASE}/messages/${id}?format=minimal&fields=sizeEstimate`,
    );
    return m.sizeEstimate ?? 0;
  });
  const avgBytes = sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0;
  return { count, avgBytes };
}

/**
 * One cleanup iteration: moves up to 500 matching messages to Trash.
 * Trash (not permanent delete) is deliberate — it's reversible for 30 days
 * and works with the gmail.modify scope; Gmail purges Trash automatically.
 * Stateless by design: rerunning after a cancel simply continues, because
 * trashed messages no longer match the query.
 */
export async function cleanupBatch(opts: CleanupOptions): Promise<{ trashed: number; remaining: number }> {
  const q = buildCleanupQuery(opts);
  const { ids } = await collectIds({ q, includeSpamTrash: "true" }, 500);
  if (ids.length > 0) {
    await googleJson(`${BASE}/messages/batchModify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX", "SPAM", "UNREAD"] }),
    });
  }
  const est = await googleJson<{ resultSizeEstimate?: number }>(
    `${BASE}/messages?${new URLSearchParams({ q, includeSpamTrash: "true", maxResults: "1", fields: "resultSizeEstimate" })}`,
  );
  return { trashed: ids.length, remaining: est.resultSizeEstimate ?? 0 };
}

/* ---------- send / reply / forward ---------- */

const encodeHeader = (v: string) => (/[^\x20-\x7e]/.test(v) ? `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=` : v);

function buildMime(input: GmailSendInput): string {
  const headers = [
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`);
  }
  const bodyB64 = Buffer.from(input.body, "utf8").toString("base64");

  if (!input.attachments?.length) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      bodyB64,
    ].join("\r\n");
  }

  const boundary = `ember_${Date.now().toString(36)}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyB64,
  ];
  for (const att of input.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      att.base64,
    );
  }
  parts.push(`--${boundary}--`);
  return parts.join("\r\n");
}

export async function sendMessage(input: GmailSendInput, asDraft: boolean): Promise<void> {
  const raw = Buffer.from(buildMime(input), "utf8").toString("base64url");
  if (asDraft) {
    await googleJson(`${BASE}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw, threadId: input.threadId } }),
    });
  } else {
    await googleJson(`${BASE}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw, threadId: input.threadId }),
    });
  }
}

export { googleFetch };
