import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Company HQ — 두근의 AI 사무실",
  description: "도트 타이쿤 스타일 AI 프로젝트 본부",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
