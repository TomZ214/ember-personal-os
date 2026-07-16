"use client";

import { useCallback } from "react";
import { useEmber } from "@/lib/store";
import type { Language } from "@/lib/types";

/**
 * Lightweight i18n. Strings live in a flat dictionary keyed by dotted names;
 * `useT()` returns a translator bound to the current language, falling back to
 * English (then the key itself) for anything not yet translated — so the app
 * never shows a blank, and pages can be localized incrementally.
 */

type Dict = Record<string, string>;

const en: Dict = {
  // navigation
  "nav.home": "Home",
  "nav.tasks": "Tasks",
  "nav.calendar": "Calendar",
  "nav.weather": "Weather",
  "nav.mail": "Mail",
  "nav.notes": "Notes",
  "nav.habits": "Habits",
  "nav.goals": "Goals",
  "nav.finance": "Finance",
  "nav.vault": "Vault",
  "nav.files": "Files",
  "nav.contacts": "Contacts",
  "nav.settings": "Settings",
  "nav.apps": "Apps",
  "nav.allApps": "All apps",

  // common actions
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.delete": "Delete",
  "action.add": "Add",
  "action.edit": "Edit",
  "action.close": "Close",
  "action.done": "Done",

  // priorities
  "priority.low": "Low",
  "priority.medium": "Medium",
  "priority.high": "High",
  "priority.urgent": "Urgent",

  // reminders
  "reminder.none": "No reminder",
  "reminder.atDue": "At due time",
  "reminder.min5": "5 minutes before",
  "reminder.min10": "10 minutes before",
  "reminder.min15": "15 minutes before",
  "reminder.min30": "30 minutes before",
  "reminder.hour1": "1 hour before",
  "reminder.hour2": "2 hours before",
  "reminder.day1": "1 day before",

  // tasks
  "tasks.title": "Tasks",
  "tasks.open": "open",
  "tasks.new": "New task",
  "tasks.sync": "Sync",
  "tasks.synced": "Tasks synced",
  "tasks.syncFailed": "Sync failed",
  "tasks.board": "Board",
  "tasks.list": "List",
  "tasks.dragHint": "Drag cards between columns",
  "tasks.col.backlog": "Backlog",
  "tasks.col.backlogHint": "Someday, maybe",
  "tasks.col.todo": "To do",
  "tasks.col.todoHint": "Committed",
  "tasks.col.doing": "In progress",
  "tasks.col.doingHint": "Right now",
  "tasks.col.done": "Done",
  "tasks.col.doneHint": "Shipped",
  "tasks.empty": "Empty",
  "tasks.dropHere": "Drop here",
  "tasks.noneYet": "No tasks yet",
  "tasks.noneYetHint": "Press ⌘K or the button above to add your first task.",
  "tasks.edit": "Edit task",
  "tasks.fTitle": "Title",
  "tasks.fTitlePh": "What needs doing?",
  "tasks.fNotes": "Notes",
  "tasks.fNotesPh": "Optional details…",
  "tasks.fStatus": "Status",
  "tasks.fPriority": "Priority",
  "tasks.fDue": "Due date",
  "tasks.fTime": "Time",
  "tasks.fReminder": "Reminder",
  "tasks.reminderNeedsDue": "Add a due date to set a reminder.",
  "tasks.fTags": "Tags",
  "tasks.fTagsPh": "work, errands",
  "tasks.repeatHint": "When you complete this, the next one is created automatically.",
  "tasks.fSubtasks": "Subtasks",
  "tasks.fSubtaskPh": "Add a step, press Enter",
  "tasks.save": "Save changes",
  "tasks.added": "Task added",
  "tasks.updated": "Task updated",
  "tasks.deleted": "Task deleted",
  "tasks.complete": "Complete",
  "tasks.reopen": "Reopen",

  // top bar
  "topbar.search": "Search anything…",

  // greetings
  "greet.morning": "Good morning",
  "greet.afternoon": "Good afternoon",
  "greet.evening": "Good evening",
  "greet.night": "Up late",

  // dashboard
  "dash.unreadOne": "unread message",
  "dash.unreadMany": "unread messages",
  "dash.inGmail": "in Gmail",
  "dash.waiting": "waiting",
  "dash.everythingUpToDate": "Everything is up to date.",

  // settings
  "settings.title": "Settings",
  "settings.sub": "Your data stays on this device unless you connect a service",
  "settings.profile": "Profile",
  "settings.yourName": "Your name",
  "settings.namePlaceholder": "How should Ember greet you?",
  "settings.language": "Language",
  "settings.languageSub": "Switch the interface between English and German.",
  "settings.weatherLocation": "Weather location",
  "settings.weatherLocationSub": "Used by the weather page and dashboard widget (Open-Meteo, no account needed).",
  "settings.placeLabel": "Place label",
  "settings.latitude": "Latitude",
  "settings.longitude": "Longitude",
  "settings.useMyLocation": "Use my location",
  "settings.locating": "Locating…",
  "settings.focusTimer": "Focus timer",
  "settings.focusMinutes": "Focus (minutes)",
  "settings.breakMinutes": "Break (minutes)",
  "settings.shortcuts": "Keyboard shortcuts",
  "settings.scOpenPalette": "Open command palette (search, create, navigate)",
  "settings.scCloseDialog": "Close any dialog",
  "settings.scNavigate": "Navigate palette results",
  "settings.data": "Data",
  "settings.dataSub": "Everything lives in your browser: localStorage for data, IndexedDB for files, an encrypted blob for the vault.",
  "settings.eraseEverything": "Erase everything",
  "settings.eraseConfirm": "Erase ALL Ember data on this device? The vault is deleted too. This cannot be undone.",
  "settings.footer": "Ember — your personal OS. Local-first, private by default.",
  "settings.connections": "Connections",
  "settings.connectionsConnected": "connected — Google & bank sync",
  "settings.connectionsLink": "Link Google (Calendar · Gmail · Contacts) and your bank",
};

const de: Dict = {
  // navigation
  "nav.home": "Start",
  "nav.tasks": "Aufgaben",
  "nav.calendar": "Kalender",
  "nav.weather": "Wetter",
  "nav.mail": "E-Mail",
  "nav.notes": "Notizen",
  "nav.habits": "Gewohnheiten",
  "nav.goals": "Ziele",
  "nav.finance": "Finanzen",
  "nav.vault": "Tresor",
  "nav.files": "Dateien",
  "nav.contacts": "Kontakte",
  "nav.settings": "Einstellungen",
  "nav.apps": "Apps",
  "nav.allApps": "Alle Apps",

  // common actions
  "action.save": "Speichern",
  "action.cancel": "Abbrechen",
  "action.delete": "Löschen",
  "action.add": "Hinzufügen",
  "action.edit": "Bearbeiten",
  "action.close": "Schließen",
  "action.done": "Fertig",

  // priorities
  "priority.low": "Niedrig",
  "priority.medium": "Normal",
  "priority.high": "Hoch",
  "priority.urgent": "Dringend",

  // reminders
  "reminder.none": "Keine Erinnerung",
  "reminder.atDue": "Zur Fälligkeit",
  "reminder.min5": "5 Minuten vorher",
  "reminder.min10": "10 Minuten vorher",
  "reminder.min15": "15 Minuten vorher",
  "reminder.min30": "30 Minuten vorher",
  "reminder.hour1": "1 Stunde vorher",
  "reminder.hour2": "2 Stunden vorher",
  "reminder.day1": "1 Tag vorher",

  // tasks
  "tasks.title": "Aufgaben",
  "tasks.open": "offen",
  "tasks.new": "Neue Aufgabe",
  "tasks.sync": "Sync",
  "tasks.synced": "Aufgaben synchronisiert",
  "tasks.syncFailed": "Sync fehlgeschlagen",
  "tasks.board": "Board",
  "tasks.list": "Liste",
  "tasks.dragHint": "Karten zwischen Spalten ziehen",
  "tasks.col.backlog": "Backlog",
  "tasks.col.backlogHint": "Irgendwann mal",
  "tasks.col.todo": "Zu erledigen",
  "tasks.col.todoHint": "Fest eingeplant",
  "tasks.col.doing": "In Arbeit",
  "tasks.col.doingHint": "Gerade jetzt",
  "tasks.col.done": "Erledigt",
  "tasks.col.doneHint": "Abgeschlossen",
  "tasks.empty": "Leer",
  "tasks.dropHere": "Hier ablegen",
  "tasks.noneYet": "Noch keine Aufgaben",
  "tasks.noneYetHint": "Drücke ⌘K oder den Knopf oben, um deine erste Aufgabe anzulegen.",
  "tasks.edit": "Aufgabe bearbeiten",
  "tasks.fTitle": "Titel",
  "tasks.fTitlePh": "Was ist zu tun?",
  "tasks.fNotes": "Notiz",
  "tasks.fNotesPh": "Optionale Details…",
  "tasks.fStatus": "Status",
  "tasks.fPriority": "Priorität",
  "tasks.fDue": "Fällig am",
  "tasks.fTime": "Uhrzeit",
  "tasks.fReminder": "Erinnerung",
  "tasks.reminderNeedsDue": "Füge ein Fälligkeitsdatum hinzu, um zu erinnern.",
  "tasks.fTags": "Tags",
  "tasks.fTagsPh": "arbeit, besorgungen",
  "tasks.repeatHint": "Wenn du das erledigst, wird die nächste automatisch angelegt.",
  "tasks.fSubtasks": "Teilaufgaben",
  "tasks.fSubtaskPh": "Schritt hinzufügen, Enter drücken",
  "tasks.save": "Änderungen speichern",
  "tasks.added": "Aufgabe hinzugefügt",
  "tasks.updated": "Aufgabe aktualisiert",
  "tasks.deleted": "Aufgabe gelöscht",
  "tasks.complete": "Erledigen",
  "tasks.reopen": "Wieder öffnen",

  // top bar
  "topbar.search": "Alles durchsuchen…",

  // greetings
  "greet.morning": "Guten Morgen",
  "greet.afternoon": "Guten Tag",
  "greet.evening": "Guten Abend",
  "greet.night": "Noch wach",

  // dashboard
  "dash.unreadOne": "ungelesene Nachricht",
  "dash.unreadMany": "ungelesene Nachrichten",
  "dash.inGmail": "in Gmail",
  "dash.waiting": "warten",
  "dash.everythingUpToDate": "Alles ist auf dem neuesten Stand.",

  // settings
  "settings.title": "Einstellungen",
  "settings.sub": "Deine Daten bleiben auf diesem Gerät, außer du verbindest einen Dienst",
  "settings.profile": "Profil",
  "settings.yourName": "Dein Name",
  "settings.namePlaceholder": "Wie soll Ember dich begrüßen?",
  "settings.language": "Sprache",
  "settings.languageSub": "Wechsle die Oberfläche zwischen Englisch und Deutsch.",
  "settings.weatherLocation": "Wetter-Standort",
  "settings.weatherLocationSub": "Wird von der Wetter-Seite und dem Dashboard-Widget genutzt (Open-Meteo, kein Konto nötig).",
  "settings.placeLabel": "Ortsbezeichnung",
  "settings.latitude": "Breitengrad",
  "settings.longitude": "Längengrad",
  "settings.useMyLocation": "Meinen Standort verwenden",
  "settings.locating": "Suche Standort…",
  "settings.focusTimer": "Fokus-Timer",
  "settings.focusMinutes": "Fokus (Minuten)",
  "settings.breakMinutes": "Pause (Minuten)",
  "settings.shortcuts": "Tastenkürzel",
  "settings.scOpenPalette": "Befehlspalette öffnen (suchen, erstellen, navigieren)",
  "settings.scCloseDialog": "Beliebiges Fenster schließen",
  "settings.scNavigate": "Durch Palettenergebnisse navigieren",
  "settings.data": "Daten",
  "settings.dataSub": "Alles liegt in deinem Browser: localStorage für Daten, IndexedDB für Dateien, ein verschlüsselter Block für den Tresor.",
  "settings.eraseEverything": "Alles löschen",
  "settings.eraseConfirm": "ALLE Ember-Daten auf diesem Gerät löschen? Der Tresor wird ebenfalls gelöscht. Das kann nicht rückgängig gemacht werden.",
  "settings.footer": "Ember — dein persönliches OS. Local-first, standardmäßig privat.",
  "settings.connections": "Verbindungen",
  "settings.connectionsConnected": "verbunden — Google & Bank-Sync",
  "settings.connectionsLink": "Google (Kalender · Gmail · Kontakte) und deine Bank verbinden",
};

const DICT: Record<Language, Dict> = { en, de };

export function useLang(): Language {
  return useEmber((s) => s.settings.language ?? "en");
}

export type Translator = (key: string, fallback?: string) => string;

/** returns a translator bound to the current language */
export function useT(): Translator {
  const lang = useLang();
  return useCallback<Translator>(
    (key, fallback) => DICT[lang][key] ?? DICT.en[key] ?? fallback ?? key,
    [lang],
  );
}

/** dictionary key for a reminder offset in minutes (see REMINDER_OPTIONS) */
const REMINDER_KEYS: Record<number, string> = {
  0: "reminder.atDue", 5: "reminder.min5", 10: "reminder.min10", 15: "reminder.min15",
  30: "reminder.min30", 60: "reminder.hour1", 120: "reminder.hour2", 1440: "reminder.day1",
};
export const reminderKey = (min: number): string => REMINDER_KEYS[min] ?? "reminder.atDue";

/** localized greeting used on the dashboard and welcome alert */
export function greetingFor(lang: Language, name: string): string {
  const h = new Date().getHours();
  const part =
    h < 5 ? DICT[lang]["greet.night"] :
    h < 12 ? DICT[lang]["greet.morning"] :
    h < 18 ? DICT[lang]["greet.afternoon"] :
    DICT[lang]["greet.evening"];
  return `${part}, ${name}`;
}
