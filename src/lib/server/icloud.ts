import "server-only";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { clearSession, readSession, writeSession } from "./session";
import type { GmailBox, GmailDetail, GmailHeader, GmailSendInput } from "@/lib/integrations/types";

/**
 * iCloud Mail via Apple's official IMAP/SMTP endpoints, authenticated with an
 * app-specific password (appleid.apple.com — revocable anytime; the real
 * Apple ID password is never used). Credentials live AES-256-GCM-encrypted in
 * the httpOnly session cookie, exactly like every other integration.
 *
 * Messages are mapped onto the same DTOs as Gmail, so both accounts share
 * one mail UI as two separate inboxes.
 */

export const ICLOUD_SESSION = "ember.icloud";

const IMAP_HOST = "imap.mail.me.com";
const SMTP_HOST = "smtp.mail.me.com";

export interface ICloudSession {
  email: string;
  password: string;
}

export class ICloudError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/** iCloud's fixed mailbox names for our unified box ids */
const BOX_MAILBOX: Record<Exclude<GmailBox, "starred">, string> = {
  inbox: "INBOX",
  sent: "Sent Messages",
  drafts: "Drafts",
  archive: "Archive",
  spam: "Junk",
  trash: "Deleted Messages",
};

function mailboxFor(box: GmailBox): string {
  return box === "starred" ? "INBOX" : BOX_MAILBOX[box];
}

export async function icloudSession(): Promise<ICloudSession | null> {
  return readSession<ICloudSession>(ICLOUD_SESSION);
}

async function requireSession(): Promise<ICloudSession> {
  const s = await icloudSession();
  if (!s) throw new ICloudError("not_connected", 401);
  return s;
}

/** open a connection, run the work, always log out */
async function withImap<T>(session: ICloudSession, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: 993,
    secure: true,
    auth: { user: session.email, pass: session.password },
    logger: false,
  });
  try {
    await client.connect();
  } catch (e) {
    const msg = String(e);
    if (/auth/i.test(msg)) {
      throw new ICloudError("iCloud rejected the sign-in — check the app-specific password", 401);
    }
    throw new ICloudError(`Couldn't reach iCloud Mail: ${msg.slice(0, 120)}`);
  }
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** verify credentials by logging in once; stores them only on success */
export async function connectICloud(email: string, password: string): Promise<void> {
  const session: ICloudSession = { email: email.trim(), password };
  await withImap(session, async () => {});
  await writeSession(ICLOUD_SESSION, session);
}

export async function disconnectICloud(): Promise<void> {
  await clearSession(ICLOUD_SESSION);
}

/* ---------- mapping ---------- */

function mapHeader(msg: FetchMessageObject, box: GmailBox): GmailHeader {
  const from = msg.envelope?.from?.[0];
  const flags = msg.flags ?? new Set<string>();
  return {
    id: String(msg.uid),
    threadId: `${box}:${msg.uid}`,
    from: from?.name || from?.address || "Unknown sender",
    fromEmail: from?.address ?? "",
    subject: msg.envelope?.subject || "(no subject)",
    snippet: "",
    date: (msg.envelope?.date ?? new Date()).toISOString(),
    unread: !flags.has("\\Seen"),
    starred: flags.has("\\Flagged"),
    labels: [],
    hasAttachments: false,
  };
}

/* ---------- listing ---------- */

export async function listICloud(box: GmailBox, query: string): Promise<{ messages: GmailHeader[]; unreadInbox: number }> {
  const session = await requireSession();
  return withImap(session, async (client) => {
    const inboxStatus = await client.status("INBOX", { unseen: true });
    const mailbox = mailboxFor(box);
    const lock = await client.getMailboxLock(mailbox).catch(() => {
      throw new ICloudError(`Mailbox "${mailbox}" not found in this iCloud account`, 404);
    });
    try {
      let uids: number[];
      if (query || box === "starred") {
        const search: Record<string, unknown> = {};
        if (box === "starred") search.flagged = true;
        if (query) search.or = [{ from: query }, { subject: query }, { body: query }];
        uids = ((await client.search(search, { uid: true })) || []) as number[];
        uids = uids.sort((a, b) => b - a).slice(0, 25);
      } else {
        const total = client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists : 0;
        if (total === 0) return { messages: [], unreadInbox: inboxStatus.unseen ?? 0 };
        // newest 25 by sequence, then resolve to uids
        const start = Math.max(1, total - 24);
        uids = [];
        for await (const msg of client.fetch(`${start}:*`, { uid: true })) uids.push(msg.uid);
        uids = uids.sort((a, b) => b - a);
      }

      const messages: GmailHeader[] = [];
      if (uids.length > 0) {
        for await (const msg of client.fetch(
          uids.join(","),
          { uid: true, envelope: true, flags: true },
          { uid: true },
        )) {
          messages.push(mapHeader(msg, box));
        }
      }
      messages.sort((a, b) => b.date.localeCompare(a.date));
      return { messages, unreadInbox: inboxStatus.unseen ?? 0 };
    } finally {
      lock.release();
    }
  });
}

/* ---------- detail ---------- */

export async function getICloudMessage(uid: string, box: GmailBox): Promise<GmailDetail & { parsed?: never }> {
  const session = await requireSession();
  return withImap(session, async (client) => {
    const lock = await client.getMailboxLock(mailboxFor(box));
    try {
      const msg = await client.fetchOne(uid, { uid: true, envelope: true, flags: true, source: true }, { uid: true });
      if (!msg || !msg.source) throw new ICloudError("Message not found", 404);
      const parsed: ParsedMail = await simpleParser(msg.source, { skipImageLinks: true });
      const header = mapHeader(msg, box);
      const body =
        parsed.text?.trim() ||
        (parsed.html
          ? parsed.html
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
              .replace(/<[^>]+>/g, "")
              .replace(/\n{3,}/g, "\n\n")
              .trim()
          : "");
      const attachments = (parsed.attachments ?? []).map((a, i) => ({
        id: String(i),
        filename: a.filename ?? `attachment-${i + 1}`,
        mimeType: a.contentType ?? "application/octet-stream",
        size: a.size ?? a.content?.length ?? 0,
        url: `/api/icloud/mail/attachment?messageId=${uid}&box=${box}&index=${i}&filename=${encodeURIComponent(a.filename ?? `attachment-${i + 1}`)}`,
      }));
      return {
        ...header,
        to: (parsed.to && "text" in parsed.to ? parsed.to.text : "") ?? "",
        body,
        attachments,
        hasAttachments: attachments.length > 0,
        messageIdHeader: parsed.messageId ?? undefined,
      };
    } finally {
      lock.release();
    }
  });
}

export async function getICloudAttachment(uid: string, box: GmailBox, index: number): Promise<{ content: Buffer; mimeType: string }> {
  const session = await requireSession();
  return withImap(session, async (client) => {
    const lock = await client.getMailboxLock(mailboxFor(box));
    try {
      const msg = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
      if (!msg || !msg.source) throw new ICloudError("Message not found", 404);
      const parsed = await simpleParser(msg.source);
      const att = parsed.attachments?.[index];
      if (!att) throw new ICloudError("Attachment not found", 404);
      return { content: att.content, mimeType: att.contentType ?? "application/octet-stream" };
    } finally {
      lock.release();
    }
  });
}

/* ---------- actions ---------- */

export type ICloudAction =
  | "read" | "unread" | "star" | "unstar"
  | "archive" | "unarchive" | "trash" | "untrash" | "spam";

export async function actICloud(uid: string, box: GmailBox, action: ICloudAction): Promise<void> {
  const session = await requireSession();
  await withImap(session, async (client) => {
    const lock = await client.getMailboxLock(mailboxFor(box));
    try {
      const range = { uid: String(uid) };
      switch (action) {
        case "read":
          await client.messageFlagsAdd(range, ["\\Seen"], { uid: true });
          break;
        case "unread":
          await client.messageFlagsRemove(range, ["\\Seen"], { uid: true });
          break;
        case "star":
          await client.messageFlagsAdd(range, ["\\Flagged"], { uid: true });
          break;
        case "unstar":
          await client.messageFlagsRemove(range, ["\\Flagged"], { uid: true });
          break;
        case "archive":
          await client.messageMove(String(uid), BOX_MAILBOX.archive, { uid: true });
          break;
        case "unarchive":
        case "untrash":
          await client.messageMove(String(uid), "INBOX", { uid: true });
          break;
        case "trash":
          await client.messageMove(String(uid), BOX_MAILBOX.trash, { uid: true });
          break;
        case "spam":
          await client.messageMove(String(uid), BOX_MAILBOX.spam, { uid: true });
          break;
      }
    } finally {
      lock.release();
    }
  });
}

/** mark every unseen inbox message as read — one IMAP STORE, no pagination needed */
export async function markAllICloudRead(): Promise<{ marked: number; remaining: number }> {
  const session = await requireSession();
  return withImap(session, async (client) => {
    const before = await client.status("INBOX", { unseen: true });
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageFlagsAdd({ seen: false }, ["\\Seen"]);
    } finally {
      lock.release();
    }
    return { marked: before.unseen ?? 0, remaining: 0 };
  });
}

/* ---------- send ---------- */

export async function sendICloud(input: GmailSendInput, asDraft: boolean): Promise<void> {
  const session = await requireSession();
  const mail = {
    from: session.email,
    to: input.to,
    subject: input.subject || "(no subject)",
    text: input.body,
    inReplyTo: input.inReplyTo,
    references: input.inReplyTo,
    attachments: (input.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.base64, "base64"),
      contentType: a.mimeType,
    })),
  };

  if (asDraft) {
    // build the raw message and append it to the Drafts mailbox
    const MailComposer = (await import("nodemailer/lib/mail-composer")).default;
    const raw: Buffer = await new MailComposer(mail).compile().build();
    await withImap(session, async (client) => {
      await client.append(BOX_MAILBOX.drafts, raw, ["\\Seen", "\\Draft"]);
    });
    return;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: 587,
    secure: false,
    auth: { user: session.email, pass: session.password },
  });
  try {
    await transport.sendMail(mail);
  } catch (e) {
    throw new ICloudError(`iCloud SMTP rejected the message: ${String(e).slice(0, 140)}`);
  }
}

/* ---------- errors ---------- */

export function icloudError(e: unknown): NextResponse {
  if (e instanceof ICloudError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[icloud]", e);
  return NextResponse.json({ error: "icloud_error", detail: String(e).slice(0, 200) }, { status: 502 });
}
