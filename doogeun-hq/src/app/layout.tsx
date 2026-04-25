import type { Metadata } from "next";
import "./globals.css";
import { ConfirmRoot } from "@/components/Confirm";
import { ToastStack } from "@/components/NotifyRoot";
import AuthGuard from "@/components/AuthGuard";

export const metadata: Metadata = {
  title: "두근컴퍼니",
  description: "AI 에이전트 오피스 — 두근컴퍼니 장점 + 팀메이커 구조 참조한 새판 빌드",
};

// React 하이드레이션 전에 실행 — localStorage에서 테마 읽어 html 태그에 즉시 주입
// (그렇지 않으면 다크→라이트 플래시 발생)
const THEME_BOOT = `
(function(){try{
  var raw=localStorage.getItem('doogeun-hq-theme');
  var t='light';
  if(raw){var p=JSON.parse(raw);if(p&&p.state&&p.state.theme)t=p.state.theme;}
  document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthGuard>{children}</AuthGuard>
        <ConfirmRoot />
        <ToastStack />
      </body>
    </html>
  );
}
