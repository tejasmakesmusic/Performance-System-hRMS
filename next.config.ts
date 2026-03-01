import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === 'development' && {
    allowedDevOrigins: ["100.103.227.36", "127.0.0.1", "localhost", "0.0.0.0"],
  }),
};

export default nextConfig;
