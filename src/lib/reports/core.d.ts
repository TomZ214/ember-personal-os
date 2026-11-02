import type { Report } from "./types";
export function cleanRecord(raw: unknown): Omit<Report, "id">;
export function splitTopics(value: string | string[]): string[];
export function recordSignature(record: Report): string;
export function parseCSV(text: string): Omit<Report, "id">[];
export function inferTopics(heading: string, filename: string): string[];
export function topicIndex(records: Report[]): { key: string; name: string; records: Report[] }[];
export function unusedTopics(records: Report[]): { name: string; category: string; idea: string }[];
export function similarTopics(index: ReturnType<typeof topicIndex>): string[][];
