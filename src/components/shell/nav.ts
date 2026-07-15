import {
  CalendarDays, CheckSquare, CloudSun, Coins, FileBox, Flag, Flame, LayoutGrid, Mail, NotebookPen,
  Repeat, Settings, ShieldCheck, Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Flame;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutGrid },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/weather", label: "Weather", icon: CloudSun },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/habits", label: "Habits", icon: Repeat },
  { href: "/goals", label: "Goals", icon: Flag },
  { href: "/finance", label: "Finance", icon: Coins },
  { href: "/vault", label: "Vault", icon: ShieldCheck },
  { href: "/files", label: "Files", icon: FileBox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];
