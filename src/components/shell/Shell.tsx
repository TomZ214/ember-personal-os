"use client";

import { usePathname } from "next/navigation";
import { Celebrations } from "@/components/ui/celebrate";
import { Toaster } from "@/components/ui/toast";
import { CloudSyncEngine } from "@/hooks/useCloudSync";
import { CommandPalette } from "./CommandPalette";
import { Dock } from "./Dock";
import { MobileTabs } from "./MobileTabs";
import { TopBar } from "./TopBar";
import { ViewportFix } from "./ViewportFix";
import { WelcomeAlert } from "./WelcomeAlert";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // /add/<token> is the public family quick-add page: no nav, no sync engine —
  // visitors get a single form and zero access to anything else
  if (pathname.startsWith("/add")) {
    return (
      <>
        <div className="ambient" aria-hidden />
        {children}
      </>
    );
  }

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
      <Celebrations />
      <CloudSyncEngine />
      <ViewportFix />
      <WelcomeAlert />
    </>
  );
}
