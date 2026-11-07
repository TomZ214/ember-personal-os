import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // route changes run as View Transitions (see template.tsx): old and new
    // page animate as compositor snapshots, not as live DOM
    viewTransition: true,
  },
  env: {
    NEXT_PUBLIC_APP_REVISION: process.env.COMMIT_REF ?? "development",
  },
};

export default nextConfig;
