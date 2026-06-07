"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import InfoTip from "@/components/ui/InfoTip";
import { authFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

interface InviteCode {
  code: string;
  role: string;
  created_by: string;
  created_at: string;
  max_uses: number;
  used_count: number;
  active: boolean;
}

const ROLE_OPTIONS = [
  { value: "guest", label: "게스트 (구경만)", desc: "채팅·읽기만 가능. 에이전트 생성 불가." },
  { value: "member", label: "사원 (본인 에이전트 OK)", desc: "Light 에이전트 생성·본인 것 관리." },
  { value: "admin", label: "관리자 (Full + 초대)", desc: "GitHub Full 에이전트 + 친구 초대 + 모든 에이전트 관리." },
];

export default function InviteCodeManager() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [role, setRole] = useState<string>("member");
  const [maxUses, setMaxUses] = useState<number>(1);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/auth/codes");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setCodes(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin, refresh]);

  if (!isAdmin) return null;

  const createCode = async () => {
    setCreating(true);
    setError(null);
    setJustCreated(null);
    try {
      const res = await authFetch("/api/auth/create-code", {
        method: "POST",
        json: { role, max_uses: maxUses },
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(d.detail || d.error || "코드 생성 실패");
      } else {
        setJustCreated(d.code);
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (code: string) => {
    if (!confirm(`${code} 비활성화? 이미 가입한 사람은 영향 없고, 아직 안 쓴 코드만 막힘.`)) return;
    try {
      const res = await authFetch(`/api/auth/codes/${code}/deactivate`, { method: "POST" });
      if (res.ok) await refresh();
    } catch {
      /* ignore */
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const buildInviteUrl = (code: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "https://600g.net";
    return `${base}/auth?code=${code}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          친구 초대 <InfoTip term="invite_code" />
        </CardTitle>
        <CardDescription>
          새 친구가 두근컴퍼니에 들어올 수 있는 8자리 비밀번호를 만들어요. 만들고 카톡으로 코드만 보내면 됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 신규 코드 생성 */}
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-3">
          <div>
            <div className="text-[12px] text-gray-400 mb-1.5 flex items-center gap-1">
              친구의 권한 <InfoTip term="role" />
            </div>
            <div className="space-y-1.5">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`w-full text-left p-2 rounded border text-[12px] transition-colors ${
                    role === opt.value
                      ? "border-sky-400/60 bg-sky-400/10"
                      : "border-gray-800 hover:border-gray-700 bg-gray-900/40"
                  }`}
                >
                  <div className="font-bold text-gray-200">{opt.label}</div>
                  <div className="text-gray-400">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[12px] text-gray-400 mb-1.5 flex items-center gap-1">
              사용 횟수 <InfoTip term="max_uses" />
            </div>
            <div className="flex gap-2">
              {[1, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxUses(n)}
                  className={`px-3 py-1.5 rounded text-[12px] border ${
                    maxUses === n
                      ? "border-sky-400/60 bg-sky-400/10 text-sky-300"
                      : "border-gray-800 text-gray-400 hover:border-gray-700"
                  }`}
                >
                  {n}회
                </button>
              ))}
            </div>
          </div>

          <Button onClick={createCode} disabled={creating} className="w-full">
            {creating ? "생성 중..." : "🔑 새 초대코드 생성"}
          </Button>
          {error && <div className="text-[12px] text-red-400">{error}</div>}
          {justCreated && (
            <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3 space-y-2">
              <div className="text-[11px] text-emerald-300">✅ 생성 완료 — 친구한테 이것만 전달:</div>
              <div className="font-mono text-[18px] tracking-widest text-emerald-200 select-all">{justCreated}</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => copyCode(justCreated)}
                  className="text-[11px] px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200"
                >
                  {copied === justCreated ? "✓ 복사됨" : "📋 코드 복사"}
                </button>
                <button
                  onClick={() => copyCode(buildInviteUrl(justCreated))}
                  className="text-[11px] px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200"
                >
                  🔗 가입 링크 복사
                </button>
              </div>
              <div className="text-[10px] text-gray-500">친구는 닉네임 + 이 코드를 입력하면 바로 가입돼요.</div>
            </div>
          )}
        </div>

        {/* 기존 코드 목록 */}
        {codes.length > 0 && (
          <div>
            <div className="text-[12px] text-gray-400 mb-2">발급한 코드 목록 ({codes.length})</div>
            <div className="space-y-1">
              {codes.map((c) => (
                <div
                  key={c.code}
                  className={`flex items-center gap-2 p-2 rounded border text-[12px] ${
                    c.active
                      ? "border-gray-800 bg-gray-900/40"
                      : "border-gray-900 bg-gray-900/20 opacity-50"
                  }`}
                >
                  <span className="font-mono font-bold text-gray-200">{c.code}</span>
                  <span className="px-1.5 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400">{c.role}</span>
                  <span className="text-[10px] text-gray-500">{c.used_count}/{c.max_uses}</span>
                  {!c.active && <span className="text-[10px] text-red-400">비활성</span>}
                  <div className="ml-auto flex gap-1">
                    {c.active && (
                      <>
                        <button onClick={() => copyCode(c.code)} className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                          {copied === c.code ? "✓" : "복사"}
                        </button>
                        <button onClick={() => deactivate(c.code)} className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300">
                          비활성
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
