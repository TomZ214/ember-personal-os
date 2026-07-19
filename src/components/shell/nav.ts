import {
  CalendarDays, CheckSquare, CloudSun, Coins, FileBox, Flag, Flame, LayoutGrid, Mail, NotebookPen,
  Repeat, Settings, ShieldCheck, } from "lucide-react";

export interface NavItem {
  href: string;
  /** English label + i18n fallback */
  label: string;
  /** i18n key suffix — the translated label is `nav.<key>` */
  key: string;
  icon: typeof Flame;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Home", key: "home", icon: LayoutGrid },
  { href: "/tasks", label: "Tasks", key: "tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", key: "calendar", icon: CalendarDays },
  { href: "/weather", label: "Weather", key: "weather", icon: CloudSun },
  { href: "/mail", label: "Mail", key: "mail", icon: Mail },
  { href: "/notes", label: "Notes", key: "notes", icon: NotebookPen },
  { href: "/habits", label: "Habits", key: "habits", icon: Repeat },
  { href: "/goals", label: "Goals", key: "goals", icon: Flag },
  { href: "/finance", label: "Finance", key: "finance", icon: Coins },
  { href: "/vault", label: "Vault", key: "vault", icon: ShieldCheck },
  { href: "/files", label: "Files", key: "files", icon: FileBox },
  { href: "/settings", label: "Settings", key: "settings", icon: Settings },
];
