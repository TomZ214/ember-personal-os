"use client";

import { desktopWindow, type ResizeDirection } from "@/lib/desktop";

/**
 * Invisible edge/corner grips that give a frameless (decorations-off) window
 * real OS resizing. Each grip forwards to `startResizeDragging`, so the resize
 * is handled natively by the compositor and stays perfectly smooth.
 */
const GRIP = 5; // px hit area for edges
const CORNER = 12;

const EDGES: { dir: ResizeDirection; style: React.CSSProperties }[] = [
  { dir: "North", style: { top: 0, left: CORNER, right: CORNER, height: GRIP, cursor: "ns-resize" } },
  { dir: "South", style: { bottom: 0, left: CORNER, right: CORNER, height: GRIP, cursor: "ns-resize" } },
  { dir: "West", style: { left: 0, top: CORNER, bottom: CORNER, width: GRIP, cursor: "ew-resize" } },
  { dir: "East", style: { right: 0, top: CORNER, bottom: CORNER, width: GRIP, cursor: "ew-resize" } },
  { dir: "NorthWest", style: { top: 0, left: 0, width: CORNER, height: CORNER, cursor: "nwse-resize" } },
  { dir: "NorthEast", style: { top: 0, right: 0, width: CORNER, height: CORNER, cursor: "nesw-resize" } },
  { dir: "SouthWest", style: { bottom: 0, left: 0, width: CORNER, height: CORNER, cursor: "nesw-resize" } },
  { dir: "SouthEast", style: { bottom: 0, right: 0, width: CORNER, height: CORNER, cursor: "nwse-resize" } },
];

export function ResizeHandles() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[2147483646]">
      {EDGES.map((e) => (
        <div
          key={e.dir}
          onMouseDown={(ev) => {
            if (ev.button !== 0) return;
            ev.preventDefault();
            desktopWindow.startResize(e.dir);
          }}
          className="pointer-events-auto fixed"
          style={e.style}
        />
      ))}
    </div>
  );
}
