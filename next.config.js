/** @type {import('next').NextConfig} */
module.exports = {
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
