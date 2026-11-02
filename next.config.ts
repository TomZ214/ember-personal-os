import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_REVISION: process.env.COMMIT_REF ?? "development",
  },
};

export default nextConfig;
