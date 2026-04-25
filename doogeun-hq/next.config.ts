import type { NextConfig } from "next";

// 정적 배포는 NEXT_EXPORT=1 일 때만 활성화 (dev 에서는 비활성 — 308/CSR 바운스 방지)
const isExport = process.env.NEXT_EXPORT === "1";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(isExport ? {
    output: "export" as const,
    images: { unoptimized: true },
    trailingSlash: true,
  } : {}),
};

export default nextConfig;
