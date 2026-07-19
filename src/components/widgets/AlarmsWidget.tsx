"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, Plus, Trash2 } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

/** Sun..Sat, in the order a German/English week picker expects (Mon first). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function dayLabels(lang: string): Record<number, string> {
  return lang === "de"
    ? { 1: "Mo", 2: "Di", 3: "Mi", 4: "Do", 5: "Fr", 6: "Sa", 0: "So" }
    : { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 0: "Sun" };
}

export function AlarmsWidget() {
  const alarms = useEmber((s) => s.alarms);
  const updateAlarm = useEmber((s) => s.updateAlarm);
  const deleteAlarm = useEmber((s) => s.deleteAlarm);
  const [editing, setEditing] = useState(false);
  const t = useT();
  const lang = useLang();
  const labels = dayLabels(lang);

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
          <AlarmClock size={14} /> {t("alarm.title")}
        </p>
        <button
          onClick={() => setEditing(true)}
          aria-label={t("alarm.new")}
          className="-mx-1 -my-2 flex items-center gap-1 px-1 py-2 text-xs text-faint transition-colors hover:text-accent"
        >
          <Plus size={13} /> {t("alarm.new")}
        </button>
      </div>

      {alarms.length === 0 ? (
        <EmptyState
          icon={<AlarmClock size={20} />}
          title={t("alarm.none")}
          hint={t("alarm.noneHint")}
        />
      ) : (
        <ul className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {alarms.map((a) => (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 40, height: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="group flex items-center gap-3 overflow-hidden rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03]"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`num block text-lg font-semibold leading-tight ${a.enabled ? "" : "text-faint line-through decoration-white/25"}`}
                  >
                    {a.time}
                  </span>
                  <span className="block truncate text-[11px] text-faint">
                    {a.label || t("alarm.untitled")}
                    {a.days.length > 0 && (
                      <> · {WEEK_ORDER.filter((d) => a.days.includes(d)).map((d) => labels[d]).join(" ")}</>
                    )}
                    {a.days.length === 0 && <> · {t("alarm.once")}</>}
                  </span>
                </span>

                <button
                  onClick={() => deleteAlarm(a.id)}
                  aria-label={t("action.delete")}
                  className="rounded-lg p-1.5 text-faint opacity-0 transition-all hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
                <input
                  type="checkbox"
                  checked={a.enabled}
                  onChange={(e) => updateAlarm(a.id, { enabled: e.target.checked })}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                  aria-label={`${a.time} ${a.enabled ? t("alarm.on") : t("alarm.off")}`}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <AlarmEditor open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function AlarmEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addAlarm = useEmber((s) => s.addAlarm);
  const t = useT();
  const lang = useLang();
  const labels = dayLabels(lang);

  const [time, setTime] = useState("07:00");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number[]>([]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const save = () => {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    addAlarm({ time, label: label.trim(), enabled: true, days });
    toast(t("alarm.created").replace("{time}", time));
    setLabel("");
    setDays([]);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("alarm.new")}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{t("alarm.time")}</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label>
            <Label>{t("alarm.label")}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("alarm.labelPh")}
            />
          </label>
        </div>

        <div>
          <Label>{t("alarm.repeat")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_ORDER.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  aria-pressed={on}
                  className={`min-w-11 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    on
                      ? "bg-accent/15 text-accent"
                      : "bg-white/[0.05] text-muted hover:bg-white/[0.08] hover:text-ink"
                  }`}
                >
                  {labels[d]}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-faint">
            {days.length === 0 ? t("alarm.onceHint") : t("alarm.repeatHint")}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" onClick={save}>
            {t("alarm.add")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
