/**
 * Client-safe DTOs shared between API routes and hooks.
 * These never contain tokens or secrets.
 */

/* ---------- connection status ---------- */

export interface ConnectionStatus {
  /** env vars present, integration can be attempted */
  configured: boolean;
  /** which env vars are missing (empty when configured) */
  missing: string[];
  connected: boolean;
  /** connected but the refresh token was revoked/expired — user must reconnect */
  needsReconnect?: boolean;
  account?: string; // e.g. gmail address or bank name
}

/* ---------- google calendar ---------- */

export interface GCalendar {
  id: string;
  name: string;
  color: string; // hex from Google
  primary: boolean;
}

export interface GAttendee {
  email: string;
  name?: string;
  status: "accepted" | "declined" | "tentative" | "needsAction";
}

export interface GEvent {
  id: string;
  calendarId: string;
  title: string;
  date: string; // yyyy-MM-dd (start day)
  start: number; // minutes from midnight
  end: number;
  allDay: boolean;
  color: string; // hex
  location?: string;
  notes?: string;
  attendees: GAttendee[];
  recurring: boolean;
  reminders: number[]; // minutes before
}

export interface GEventInput {
  calendarId?: string;
  title: string;
  date: string;
  start: number;
  end: number;
  location?: string;
  notes?: string;
  recurrence?: "none" | "daily" | "weekly";
}

/* ---------- gmail ---------- */

export type GmailBox = "inbox" | "starred" | "sent" | "drafts" | "archive" | "trash" | "spam";

export interface GmailHeader {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: string; // ISO
  unread: boolean;
  starred: boolean;
  labels: string[];
  hasAttachments: boolean;
}

export interface GmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  /** ready-to-use download URL, provider-specific */
  url?: string;
}

export interface GmailDetail extends GmailHeader {
  to: string;
  body: string; // plain text
  attachments: GmailAttachment[];
  messageIdHeader?: string; // RFC822 Message-ID, for replies
}

export interface GmailSendInput {
  to: string;
  subject: string;
  body: string;
  /** reply/forward context */
  threadId?: string;
  inReplyTo?: string;
  attachments?: { filename: string; mimeType: string; base64: string }[];
}

/* ---------- google contacts ---------- */

export interface GContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  birthday?: string; // yyyy-MM-dd (year may be 0000)
  photo?: string;
  organization?: string;
}

/* ---------- banking ---------- */

export interface BankInstitution {
  id: string;
  name: string;
  logo: string;
}

export interface BankAccount {
  id: string;
  iban: string;
  name: string;
  currency: string;
  balance: number;
  balanceType: string;
}

export interface BankTxn {
  id: string;
  accountId: string;
  amount: number; // signed: negative = outgoing
  currency: string;
  date: string; // yyyy-MM-dd
  merchant: string; // cleaned counterparty
  raw: string; // original remittance line
  category: string;
  pending: boolean;
}

export interface BankSubscription {
  merchant: string;
  amount: number;
  category: string;
  lastDate: string;
  occurrences: number;
}
