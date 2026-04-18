import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "두근컴퍼니",
  description: "AI 에이전트 오피스 — 두근컴퍼니 장점 + 팀메이커 구조 참조한 새판 빌드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
