"use client";

import { usePathname } from "next/navigation";
import { Celebrations } from "@/components/ui/celebrate";
import { ThemeApplier } from "@/components/ui/ThemeApplier";
import { Toaster } from "@/components/ui/toast";
import { CloudSyncEngine } from "@/hooks/useCloudSync";
import { useIsDesktop } from "@/lib/desktop";
import { DesktopProvider } from "@/components/desktop/DesktopProvider";
import { ResizeHandles } from "@/components/desktop/ResizeHandles";
import { BootSequence } from "./BootSequence";
import { CommandPalette } from "./CommandPalette";
import { SoundEngine } from "./SoundEngine";
import { Dock } from "./Dock";
import { MobileTabs } from "./MobileTabs";
import { TaskCleanup } from "./TaskCleanup";
import { TopBar } from "./TopBar";
import { ViewportFix } from "./ViewportFix";
import { WelcomeAlert } from "./WelcomeAlert";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const desktop = useIsDesktop();

  // /add/<token> is the public family quick-add page: no nav, no sync engine —
  // visitors get a single form and zero access to anything else
  if (pathname.startsWith("/add")) {
    return (
      <>
        <ThemeApplier />
        <div className="ambient" aria-hidden />
        {children}
      </>
    );
  }

  return (
    <DesktopProvider>
      <ThemeApplier />
      <div className="ambient" aria-hidden />
      <TopBar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-32 pt-6 sm:px-6 md:pb-28">
        {children}
      </main>
      <Dock />
      <MobileTabs />
      <CommandPalette />
      <Toaster />
      <Celebrations />
      <CloudSyncEngine />
      <TaskCleanup />
      <ViewportFix />
      <WelcomeAlert />
      <BootSequence />
      <SoundEngine />
      {desktop && <ResizeHandles />}
    </DesktopProvider>
  );
}
