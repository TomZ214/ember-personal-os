import type { MetadataRoute } from "next";

/** PWA manifest — makes Ember installable with its icon on Android/desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ember — Personal OS",
    short_name: "Ember",
    description: "Your entire life, organized in one calm, fast place.",
    start_url: "/",
    display: "standalone",
    background_color: "#141414",
    theme_color: "#141414",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
