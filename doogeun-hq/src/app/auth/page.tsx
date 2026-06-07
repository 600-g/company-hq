"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";
import { apiBase } from "@/lib/utils";
import { persistToken } from "@/lib/api";

export default function AuthPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"code" | "owner">("code");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ?code=XXX 자동 입력 (오너가 보낸 가입 링크)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get("code");
    if (c) {
      setCode(c.toUpperCase());
      setMode("code");
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "owner") {
        const res = await fetch(`${apiBase()}/api/auth/owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const d = await res.json();
        if (!res.ok || !d.ok) throw new Error(d.error || "로그인 실패");
        persistToken(d.token); // 쿠키 백업 (캐시 삭제 시 복원용)
        login(d.token, { id: d.user_id || "owner", nickname: d.nickname || "오너", role: "owner", loggedInAt: Date.now() });
        const next1 = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
        router.push(next1 || "/hub");
        return;
      }
      // 초대 코드로 신규 가입 — /api/auth/register (이전 /verify 는 토큰 검증 전용이라 잘못 호출됐었음)
      const res = await fetch(`${apiBase()}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, code }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || "초대코드가 유효하지 않습니다.");
      persistToken(d.token);
      login(d.token, {
        id: d.user_id || nickname,
        nickname: d.nickname || nickname,
        role: d.role || "member",
        loggedInAt: Date.now(),
      });
      const next2 = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
      router.push(next2 || "/hub");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="두근컴퍼니 · 로그인" />
      <main className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>로그인</CardTitle>
            <CardDescription>
              초대 코드 또는 오너 비밀번호로 들어오세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 mb-4 p-1 bg-gray-900/60 rounded border border-gray-800">
              <button
                onClick={() => setMode("code")}
                className={`flex-1 text-[12px] py-1.5 rounded transition-colors ${
                  mode === "code" ? "bg-sky-400/15 text-sky-300 font-bold" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                초대 코드
              </button>
              <button
                onClick={() => setMode("owner")}
                className={`flex-1 text-[12px] py-1.5 rounded transition-colors ${
                  mode === "owner" ? "bg-sky-400/15 text-sky-300 font-bold" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                오너
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === "code" ? (
                <>
                  <div>
                    <label className="text-[12px] text-gray-400">닉네임</label>
                    <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="이두근" required />
                  </div>
                  <div>
                    <label className="text-[12px] text-gray-400">초대 코드</label>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6자리 코드" required />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-[12px] text-gray-400">오너 비밀번호</label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              )}

              {error && <div className="text-[12px] text-red-400">{error}</div>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "확인 중..." : "로그인"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
