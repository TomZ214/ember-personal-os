"use client";

import { useEffect } from "react";
import { useEmber, useHydrated } from "@/lib/store";

/**
 * Housekeeping: completed tasks are dropped once they pass the retention
 * window (see COMPLETED_TASK_TTL_HOURS). Runs once the persisted state is in,
 * then hourly — so a long-running window (the desktop app lives for days)
 * still tidies up without a reload.
 */
export function TaskCleanup() {
  const hydrated = useHydrated();
  const purge = useEmber((s) => s.purgeCompletedTasks);

  useEffect(() => {
    if (!hydrated) return;
    purge();
    const timer = setInterval(purge, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [hydrated, purge]);

  return null;
}
