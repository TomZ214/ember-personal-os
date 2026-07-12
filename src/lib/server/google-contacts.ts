import "server-only";
import { googleJson } from "./google";
import type { GContact } from "@/lib/integrations/types";

interface RawPerson {
  resourceName: string;
  names?: { displayName: string }[];
  emailAddresses?: { value: string }[];
  phoneNumbers?: { value: string }[];
  birthdays?: { date?: { year?: number; month: number; day: number } }[];
  photos?: { url: string; default?: boolean }[];
  organizations?: { name?: string; title?: string }[];
}

export async function listContacts(): Promise<GContact[]> {
  const params = new URLSearchParams({
    personFields: "names,emailAddresses,phoneNumbers,birthdays,photos,organizations",
    pageSize: "200",
    sortOrder: "FIRST_NAME_ASCENDING",
  });
  const data = await googleJson<{ connections?: RawPerson[] }>(
    `https://people.googleapis.com/v1/people/me/connections?${params}`,
  );
  return (data.connections ?? [])
    .filter((p) => p.names?.[0]?.displayName)
    .map((p) => {
      const bd = p.birthdays?.[0]?.date;
      const org = p.organizations?.[0];
      return {
        id: p.resourceName,
        name: p.names![0].displayName,
        email: p.emailAddresses?.[0]?.value,
        phone: p.phoneNumbers?.[0]?.value,
        birthday: bd
          ? `${bd.year ?? 2000}-${String(bd.month).padStart(2, "0")}-${String(bd.day).padStart(2, "0")}`
          : undefined,
        photo: p.photos?.find((ph) => !ph.default)?.url,
        organization: org ? [org.title, org.name].filter(Boolean).join(" · ") : undefined,
      };
    });
}
