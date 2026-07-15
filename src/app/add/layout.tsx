import type { Metadata } from "next";

/**
 * The family quick-add page is its own tiny "app" for people without an
 * account. We drop the main web-app manifest on this route: its
 * `start_url: "/"` would otherwise make iOS's "Add to Home Screen" launch the
 * MAIN app instead of this page. With no manifest, iOS uses the actual page
 * URL (/add/<token>) as the shortcut's launch URL.
 */
export const metadata: Metadata = {
  manifest: null,
};

export default function AddLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
