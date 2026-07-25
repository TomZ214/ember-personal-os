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
      <head>
        {/* Paint the saved appearance before first paint so there's no flash of
            the default sunset ramp — or, worse, of glass surfaces that are
            about to be switched off. Reads the same persisted zustand blob the
            app uses; any failure just leaves the CSS defaults in place. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem("ember-os")||"{}")?.state?.settings||{},e=document.documentElement,d=e.dataset;if(s.theme&&s.theme!=="sunset")d.accent=s.theme;d.appearance=s.appearance||"ember";d.glass=s.liquidGlass===false?"off":"on";d.fx=s.reducedEffects?"reduced":"full";d.lighting=s.cursorLighting===false?"off":"on";d.reflect=s.glassReflections===false?"off":"on";e.style.setProperty("--blur-scale",s.blurStrength??1);e.style.setProperty("--tint-scale",s.transparencyStrength??1);}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
