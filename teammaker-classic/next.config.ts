import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import * as path from "path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Turbopack root 를 레포 최상위(company-hq/)로 설정 → ui/app/components 등 심링크 접근 허용.
// 두근컴퍼니 Option B: teammaker-classic/src/components/doogeun/app/* 가 ../../../../ui/app/* 를 가리킴.
const REPO_ROOT = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: REPO_ROOT,
  },
  outputFileTracingRoot: REPO_ROOT,
};

export default withNextIntl(nextConfig);
