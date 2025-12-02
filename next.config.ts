import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingIncludes: {
    '/*': ['./node_modules/.prisma/client/**/*'],
    '/api/*': ['./node_modules/.prisma/client/**/*'],
  },
};

export default nextConfig;
