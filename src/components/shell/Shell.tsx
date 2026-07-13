"use client";

import { Toaster } from "@/components/ui/toast";
import { CloudSyncEngine } from "@/hooks/useCloudSync";
import { CommandPalette } from "./CommandPalette";
import { Dock } from "./Dock";
import { MobileTabs } from "./MobileTabs";
import { TopBar } from "./TopBar";
import { ViewportFix } from "./ViewportFix";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="ambient" aria-hidden />
      <TopBar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-32 pt-6 sm:px-6 md:pb-28">
        {children}
      </main>
      <Dock />
      <MobileTabs />
      <CommandPalette />
      <Toaster />
      <CloudSyncEngine />
      <ViewportFix />
    </>
  );
}
