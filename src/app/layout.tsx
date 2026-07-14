import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Shell } from "@/components/shell/Shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Ember — Personal OS", template: "%s · Ember" },
  description: "Your entire life, organized in one calm, fast place.",
  // browser-tab + iOS home-screen icons are generated from the file
  // conventions: app/favicon.ico, app/icon.png, app/apple-icon.png
  manifest: "/manifest.webmanifest",
  // "Add to Home Screen" on iOS launches Ember fullscreen, like a native app
  appleWebApp: {
    capable: true,
    title: "Ember",
    statusBarStyle: "black-translucent",
  },
  // Next only emits the modern tag; older iOS wants the apple-prefixed one too
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#141414",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
