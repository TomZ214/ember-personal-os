"use client";

import { useEffect, useState } from "react";
import { Minus, X } from "lucide-react";
import { desktopWindow } from "@/lib/desktop";

/**
 * Frameless window controls (minimize / maximize-restore / close) for the
 * custom title bar. Rendered only inside the Tauri shell.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    desktopWindow.isMaximized().then(setMaximized);
    desktopWindow
      .onResized(() => desktopWindow.isMaximized().then(setMaximized))
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  return (
    <div className="flex items-center gap-0.5" data-tauri-drag-region={false}>
      <Ctl label="Minimize" onClick={() => desktopWindow.minimize()}>
        <Minus size={15} />
      </Ctl>
      <Ctl label={maximized ? "Restore" : "Maximize"} onClick={() => desktopWindow.toggleMaximize()}>
        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </Ctl>
      <Ctl label="Close" danger onClick={() => desktopWindow.close()}>
        <X size={16} />
      </Ctl>
    </div>
  );
}

function Ctl({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-11 items-center justify-center rounded-[9px] text-muted transition-colors ${
        danger ? "hover:bg-danger/85 hover:text-white" : "hover:bg-white/[0.09] hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* crisp 10px square glyphs, tuned to sit optically centered */
function MaximizeGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function RestoreGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="1" y="3" width="7" height="7" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.4 3V2.2A1.2 1.2 0 0 1 4.6 1H9a1 1 0 0 1 1 1v4.4A1.2 1.2 0 0 1 8.8 7.6H8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
