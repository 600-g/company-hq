"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InfoTip from "@/components/ui/InfoTip";
import { authFetch } from "@/lib/api";

interface KeyGuide {
  key: string;
  label: string;
  set: boolean;
  masked: string;
  required: boolean;
  why: string;
  where: string;
  signup_steps: string[];
  free: string;
}

interface SetupResponse {
  ok: boolean;
  user: { user_id: string; nickname: string; role: string; role_label: string };
  permissions: { label?: string; can_code?: boolean; can_create_team?: boolean };
  keys_status: Record<string, { set: boolean; masked: string }>;
  guides: KeyGuide[];
  next_steps: string[];
}

const KEY_TERMS: Record<string, string> = {
  github_token: "github_token",
  gemini_api_key: "gemini",
  anthropic_api_key: "anthropic",
};

export default function MyAccountGuide() {
  const [data, setData] = useState<SetupResponse | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/auth/me/setup");
      if (res.ok) {
        const d = await res.json();
        if (d.ok) setData(d);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveKey = async (key: string) => {
    const v = editing[key];
    if (v === undefined) return;
    const res = await authFetch("/api/auth/me/keys", {
      method: "PUT",
      json: { keys: { [key]: v } },
    });
    if (res.ok) {
      setSavedFlash(key);
      setEditing((p) => ({ ...p, [key]: "" }));
      setTimeout(() => setSavedFlash(null), 1500);
      refresh();
    }
  };

  if (!data) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-[12px] text-gray-500">
          내 정보 불러오는 중...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          내 계정 · API 키 설정 <InfoTip term="api_key" />
        </CardTitle>
        <CardDescription>
          닉네임: <span className="text-gray-200 font-bold">{data.user.nickname}</span> ·
          권한: <span className="text-sky-300 font-bold">{data.user.role_label}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-sky-400/30 bg-sky-500/5 p-3 text-[12px] text-gray-300">
          <div className="font-bold text-sky-300 mb-1.5">💡 가입 안 해도 일단 됩니다</div>
          <div>
            두근컴퍼니가 이미 공용 <InfoTip term="gemini" label="Gemini" /> 키를 갖고 있어서, 친구는 아무것도 안 넣어도
            자동으로 무료 LLM 사용 가능. 아래 키들은 <strong>본인 할당량을 따로 쓰고 싶을 때만</strong> 추가하면 됩니다.
          </div>
        </div>

        {data.guides.map((g) => {
          const isOpen = expanded[g.key] ?? false;
          return (
            <div key={g.key} className="rounded-lg border border-gray-800 bg-gray-900/40">
              <button
                type="button"
                onClick={() => setExpanded((p) => ({ ...p, [g.key]: !isOpen }))}
                className="w-full p-3 flex items-center gap-2 text-left hover:bg-gray-900/60 transition-colors"
              >
                <span className="text-[16px]">{g.set ? "✅" : g.required ? "🔴" : "⚪"}</span>
                <span className="font-bold text-[13px] text-gray-200">
                  <InfoTip term={KEY_TERMS[g.key]} label={g.label} />
                </span>
                {g.set && <span className="text-[10px] font-mono text-emerald-400">{g.masked}</span>}
                <span className="ml-auto text-[11px] text-gray-500">{isOpen ? "접기 ▲" : "펼치기 ▼"}</span>
              </button>

              {isOpen && (
                <div className="p-3 pt-0 space-y-2 text-[12px]">
                  <div className="text-gray-300">
                    <span className="text-gray-500">왜 필요? </span>{g.why}
                  </div>
                  <div className="text-emerald-300">{g.free}</div>

                  <details className="text-gray-400">
                    <summary className="cursor-pointer text-sky-400 hover:text-sky-300">
                      📋 발급 방법 (클릭해서 보기)
                    </summary>
                    <ol className="list-decimal list-inside mt-2 space-y-1 text-[11px]">
                      {g.signup_steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                    <a
                      href={g.where}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-[11px] text-sky-400 hover:text-sky-300 underline"
                    >
                      🔗 {g.where}
                    </a>
                  </details>

                  <div className="flex gap-2 pt-1">
                    <Input
                      type="password"
                      placeholder={g.set ? "다시 입력하면 덮어쓰기" : "여기에 키 붙여넣기"}
                      value={editing[g.key] || ""}
                      onChange={(e) => setEditing((p) => ({ ...p, [g.key]: e.target.value }))}
                      className="flex-1 text-[12px]"
                    />
                    <Button size="sm" onClick={() => saveKey(g.key)} disabled={!editing[g.key]}>
                      {savedFlash === g.key ? "✓ 저장됨" : "저장"}
                    </Button>
                    {g.set && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing((p) => ({ ...p, [g.key]: "" }));
                          // 빈 문자열 저장 → 백엔드가 키 삭제
                          authFetch("/api/auth/me/keys", {
                            method: "PUT",
                            json: { keys: { [g.key]: "" } },
                          }).then(refresh);
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        삭제
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {data.next_steps && data.next_steps.length > 0 && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-[12px] text-gray-300 space-y-1.5">
            <div className="font-bold text-amber-300">📍 다음에 해볼 일</div>
            {data.next_steps.map((step, i) => (
              <div key={i}>• {step}</div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
