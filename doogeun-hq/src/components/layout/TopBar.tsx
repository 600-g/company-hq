"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, LogOut, Bug, Server, Home, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";

interface Props {
  title?: string;
}

export default function TopBar({ title = "두근컴퍼니 HQ" }: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);

  return (
    <header className="flex h-12 items-center border-b border-gray-800/60 px-4 bg-[var(--background)]">
      <Link href="/" className="flex items-center gap-2 font-bold text-sky-300 hover:text-gray-200 transition-colors">
        <Home className="w-4 h-4" />
        {title}
      </Link>

      <nav className="ml-6 flex items-center gap-1 text-[13px]">
        <Link href="/office" className="px-2 py-1 rounded hover:bg-gray-800/40 text-gray-400 hover:text-gray-200">오피스</Link>
        <Link href="/chat" className="px-2 py-1 rounded hover:bg-gray-800/40 text-gray-400 hover:text-gray-200">채팅</Link>
        <Link href="/agents" className="px-2 py-1 rounded hover:bg-gray-800/40 text-gray-400 hover:text-gray-200">에이전트</Link>
        <Link href="/bugs" className="px-2 py-1 rounded hover:bg-gray-800/40 text-gray-400 hover:text-gray-200">버그</Link>
        <Link href="/server" className="px-2 py-1 rounded hover:bg-gray-800/40 text-gray-400 hover:text-gray-200">서버실</Link>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        {user ? (
          <>
            <Badge variant={user.role === "owner" ? "default" : "secondary"}>
              {user.nickname} · {user.role}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => { logout(); router.push("/"); }} title="로그아웃">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => router.push("/auth")}>
            로그인
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocale(locale === "ko" ? "en" : "ko")}
          title={`언어: ${locale.toUpperCase()} (클릭으로 전환)`}
        >
          <Languages className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => router.push("/server")}>
          <Server className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => router.push("/bugs")}>
          <Bug className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => router.push("/settings")}>
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
