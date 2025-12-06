import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  turbopack: {},

  serverExternalPackages: [
    '@tensorflow/tfjs-node',
  ],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },

  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/.prisma/client/**/*"],
    "/*": ["./node_modules/.prisma/client/**/*"],
  },
};

export default nextConfig;