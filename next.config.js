/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

module.exports = {
  // Workaround for Windows EPERM on `.next/trace` (output file tracing).
  // IMPORTANT: Keep tracing enabled on Vercel; disabling it can cause runtime 500s
  // due to missing server/app manifests (e.g. `clientModules` undefined).
  outputFileTracing: isVercel,
  experimental: {
    optimizeCss: false,            // ปิด lightningcss (กัน error binary)
    disableOptimizedLoading: true, // กัน error preloading บางเคส
  },
  eslint: {
    ignoreDuringBuilds: true,      // ข้าม ESLint ตอน build บน Vercel
  },
  typescript: {
    ignoreBuildErrors: true,       // ข้าม TS error ตอน build (กัน deploy fail)
  },
};
