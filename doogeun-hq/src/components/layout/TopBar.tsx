"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Settings, LogOut, Home, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/authStore";

interface Props {
  title?: string;
}

/** 공통 상단바 — /hub 외 서브페이지에서 사용. 뒤로가기 + 언어 + 로그아웃. */
export default function TopBar({ title = "두근컴퍼니" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const onSettings = pathname === "/settings" || pathname === "/settings/";
  const onHub = pathname === "/hub" || pathname === "/hub/";

  return (
    <header className="flex h-12 items-center border-b border-gray-800/60 px-3 bg-[var(--background)] gap-2">
      {!onHub && (
        <button
          onClick={() => router.push("/hub")}
          className="h-8 px-2 rounded hover:bg-gray-800/40 text-gray-400 hover:text-gray-200 flex items-center gap-1 text-[12px]"
          title="허브로"
        >
          <ArrowLeft className="w-4 h-4" /> 허브
        </button>
      )}
      <Link href="/hub" className="flex items-center gap-2 font-bold text-sky-300 hover:text-gray-200 transition-colors">
        <Home className="w-4 h-4" />
        <span className="text-[14px]">{title}</span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        {user && (
          <Badge variant={user.role === "owner" ? "default" : "secondary"}>
            {user.nickname} · {user.role}
          </Badge>
        )}
        {!onSettings && (
          <button
            onClick={() => router.push("/settings")}
            className="h-8 w-8 rounded hover:bg-gray-800/40 text-gray-400 hover:text-gray-200 flex items-center justify-center"
            title="설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
        {user ? (
          <button
            onClick={() => { logout(); router.push("/"); }}
            className="h-8 w-8 rounded hover:bg-gray-800/40 text-gray-400 hover:text-red-400 flex items-center justify-center"
            title="로그아웃"
          >
            <LogOut className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={() => router.push("/auth")} className="h-8 px-3 rounded border border-sky-400/40 bg-sky-500/10 text-sky-200 text-[12px] hover:bg-sky-500/20">
            로그인
          </button>
        )}
      </div>
    </header>
  );
}
