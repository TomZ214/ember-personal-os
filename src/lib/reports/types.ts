export interface Attachment { id: string; name: string; blob: Blob; hash?: string }
export interface Report {
  id: string; number: string; from: string; to: string; department: string;
  topics: string[]; status: "open" | "completed"; note: string; reference: string;
  attachments: Attachment[]; createdAt?: string;
}
