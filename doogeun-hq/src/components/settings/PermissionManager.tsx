"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import InfoTip from "@/components/ui/InfoTip";
import { authFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

interface Capability {
  label: string;
  info: string;
}
interface CapsResponse {
  capabilities: Record<string, Capability>;
  role_defaults: Record<string, string[]>;
}
interface UserRow {
  user_id: string;
  nickname: string;
  role: string;
  role_label: string;
  role_defaults: string[];
  granted_caps: string[];
  revoked_caps: string[];
  capabilities: string[];
  created_at: string;
  last_active: string;
  invite_code?: string;
}
interface InviteCode {
  code: string;
  role: string;
  created_by: string;
  created_at: string;
  max_uses: number;
  used_count: number;
  active: boolean;
  extra_caps?: string[];
}

const ROLE_PRESETS = [
  { value: "guest", label: "게스트 (구경)" },
  { value: "member", label: "사원 (본인 에이전트)" },
  { value: "manager", label: "매니저 + 사용자초대" },
  { value: "admin", label: "관리자 (거의 전부)" },
];

export default function PermissionManager() {
  const [tab, setTab] = useState<"users" | "invite">("users");
  const myCaps = useAuthStore((s) => s.user) || null;
  const [caps, setCaps] = useState<CapsResponse | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [canInvite, setCanInvite] = useState(false);

  // 초기 1회만 loading 토글 — 이후 변경은 reloadLists() 로 list 만 갱신 (성공 카드 깜빡임 방지)
  const reloadLists = useCallback(async () => {
    const jobs: Promise<unknown>[] = [];
    if (canManage) {
      jobs.push(
        authFetch("/api/auth/users/full")
          .then((r) => r.ok ? r.json() : null)
          .then((d) => d?.ok && setUsers(d.users))
          .catch(() => {})
      );
    }
    if (canInvite) {
      jobs.push(
        authFetch("/api/auth/codes")
          .then((r) => r.ok ? r.json() : null)
          .then((d) => Array.isArray(d) && setCodes(d))
          .catch(() => {})
      );
    }
    await Promise.all(jobs);
  }, [canManage, canInvite]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [capsR, meR] = await Promise.all([
        authFetch("/api/auth/capabilities"),
        authFetch("/api/auth/me/setup"),
      ]);
      if (capsR.ok) {
        const d = await capsR.json();
        if (d.ok) setCaps(d);
      }
      if (meR.ok) {
        const me = await meR.json();
        if (me?.ok) {
          const myCapList: string[] = me.capabilities || [];
          setCanManage(myCapList.includes("manage_users"));
          setCanInvite(myCapList.includes("invite_users"));
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 사용자/코드 목록 — manage_users / invite_users 있을 때만 (초기 + 변경)
  useEffect(() => {
    reloadLists();
  }, [reloadLists]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-[12px] text-gray-500">권한 정보 불러오는 중...</CardContent>
      </Card>
    );
  }
  if (!canManage && !canInvite) return null;
  if (!caps) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          권한 관리 <InfoTip inline={{ title: "권한 관리", body: "사용자별 권한 체크박스 토글 + 초대코드 발급. manage_users 또는 invite_users 권한 보유자만 보임." }} />
        </CardTitle>
        <CardDescription>
          역할 기본 위에 체크박스로 개별 권한을 켜고 끌 수 있어요. 사용자 초대도 여기서.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 탭 — font-bold 항상 적용 (폰트 굵기 변화로 인한 너비 시프트 방지) */}
        <div className="flex gap-1 p-1 bg-gray-900/60 rounded border border-gray-800">
          {canManage && (
            <button
              onClick={() => setTab("users")}
              className={`flex-1 text-[12px] py-1.5 rounded font-bold transition-colors ${tab === "users" ? "bg-sky-400/15 text-sky-300" : "text-gray-400 hover:text-gray-200"}`}
            >
              👥 사용자 권한
            </button>
          )}
          {canInvite && (
            <button
              onClick={() => setTab("invite")}
              className={`flex-1 text-[12px] py-1.5 rounded font-bold transition-colors ${tab === "invite" ? "bg-sky-400/15 text-sky-300" : "text-gray-400 hover:text-gray-200"}`}
            >
              🔑 초대 코드
            </button>
          )}
        </div>

        {/* 탭 컨텐츠 영역 — min-height 로 콘텐츠 길이 차이로 인한 페이지 시프트 방지 */}
        <div className="min-h-[420px]" style={{ scrollbarGutter: "stable" }}>
          {tab === "users" && canManage && (
            <UsersPanel users={users} caps={caps} onChanged={() => reloadLists()} />
          )}
          {tab === "invite" && canInvite && (
            <InvitePanel codes={codes} caps={caps} onChanged={() => reloadLists()} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─ 사용자 권한 패널 ────────────────────────────────── */
function UsersPanel({ users, caps, onChanged }: { users: UserRow[]; caps: CapsResponse; onChanged: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch { /* ignore */ }
  };

  const startEdit = (u: UserRow) => {
    setExpanded(u.user_id);
    setDraft((p) => ({ ...p, [u.user_id]: new Set(u.capabilities) }));
  };
  const toggle = (uid: string, cap: string) => {
    setDraft((p) => {
      const s = new Set(p[uid] || []);
      if (s.has(cap)) s.delete(cap);
      else s.add(cap);
      return { ...p, [uid]: s };
    });
  };
  const save = async (uid: string) => {
    setSavingId(uid);
    try {
      const list = Array.from(draft[uid] || []);
      const res = await authFetch(`/api/auth/users/${uid}/capabilities`, {
        method: "PUT",
        json: { capabilities: list },
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        alert(d.detail || d.error || "저장 실패");
      } else {
        setExpanded(null);
        onChanged();
      }
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (u: UserRow) => {
    if (!confirm(`정말 "${u.nickname}" 계정을 완전 삭제할까요?\n\n· 해당 사용자가 만든 에이전트는 자동 삭제되지 않습니다\n· 본인이 발급받았던 초대코드도 함께 만료\n· 복구 불가`)) return;
    const res = await authFetch(`/api/auth/users/${u.user_id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) {
      alert(d.detail || d.error || "삭제 실패");
      return;
    }
    setExpanded(null);
    onChanged();
  };

  if (users.length === 0) {
    return <div className="text-[12px] text-gray-500 text-center py-4">아직 가입한 사용자가 없어요.</div>;
  }

  return (
    <div className="space-y-1.5">
      {users.map((u) => {
        // 오너는 원래 전부 — 체크박스 안 띄움
        if (u.role === "owner") {
          return (
            <div key={u.user_id} className="rounded border border-amber-400/30 bg-amber-500/5 p-2.5 flex items-center gap-2">
              <span className="font-bold text-[13px] text-amber-100">{u.nickname}</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[10px] text-amber-200">👑 오너</span>
              <span className="ml-auto text-[10px] text-gray-500">모든 권한 (체크 불필요)</span>
            </div>
          );
        }
        const isExp = expanded === u.user_id;
        const current = draft[u.user_id] || new Set(u.capabilities);
        return (
          <div key={u.user_id} className="rounded border border-gray-800 bg-gray-900/40">
            <div className="w-full p-2.5 flex items-center gap-2 hover:bg-gray-900/60 transition-colors">
              <button
                type="button"
                onClick={() => isExp ? setExpanded(null) : startEdit(u)}
                className="font-bold text-[13px] text-gray-200 hover:text-sky-300 text-left"
              >
                {u.nickname}
              </button>
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400">{u.role_label}</span>
              {u.invite_code && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyCode(u.invite_code!); }}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 text-[10px] font-mono text-sky-300 transition-colors"
                  title="초대코드 복사"
                >
                  🔑 {u.invite_code}
                  <span className="text-[9px] text-sky-200">
                    {copiedCode === u.invite_code ? "✓" : "복사"}
                  </span>
                </button>
              )}
              <span className="text-[10px] text-gray-500">{u.capabilities.length} / {Object.keys(caps.capabilities).length} 권한</span>
              <button
                type="button"
                onClick={() => isExp ? setExpanded(null) : startEdit(u)}
                className="ml-auto text-[11px] text-gray-500 hover:text-gray-300"
              >
                {isExp ? "접기 ▲" : "수정 ▼"}
              </button>
            </div>
            {isExp && (
              <div className="p-3 pt-0 space-y-2">
                <div className="text-[11px] text-gray-400">체크하면 부여, 풀면 박탈. 저장 누를 때만 반영.</div>
                <div className="text-[11px] text-gray-400 mb-1.5">
                  🔒 잠금된 건 역할 기본 권한 (변경 불가). 잠금 해제된 건 추가/박탈 가능.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {Object.entries(caps.capabilities).map(([key, info]) => {
                    const inDefault = u.role_defaults.includes(key);
                    const checked = inDefault || current.has(key);
                    return (
                      <label key={key} className={`flex items-start gap-2 p-2 rounded border transition-colors ${
                        inDefault ? "border-sky-400/30 bg-sky-500/5 cursor-default" :
                        checked ? "border-emerald-400/30 bg-emerald-500/5 cursor-pointer" :
                        "border-gray-800 cursor-pointer hover:border-gray-700"
                      }`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={inDefault}
                          onChange={() => { if (!inDefault) toggle(u.user_id, key); }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-bold text-gray-200 flex items-center gap-1.5">
                            {info.label}
                            {inDefault && <span className="text-[9px] text-sky-300">🔒 기본</span>}
                          </div>
                          <div className="text-[11px] text-gray-500">{info.info}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => save(u.user_id)} disabled={savingId === u.user_id}>
                    {savingId === u.user_id ? "저장 중..." : "💾 저장"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>취소</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteUser(u)}
                    className="ml-auto text-red-300 hover:text-red-200 hover:bg-red-500/10"
                  >
                    🗑️ 계정 삭제
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─ 초대코드 패널 ─────────────────────────────────── */
function InvitePanel({ codes, caps, onChanged }: { codes: InviteCode[]; caps: CapsResponse; onChanged: () => void }) {
  const [role, setRole] = useState<string>("member");
  const [extraCaps, setExtraCaps] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<{ code: string; role: string; extras: string[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // 역할 변경 시 추가 권한 초기화 (역할 기본 위에 추가만 표시)
  const roleDefaults = new Set(caps.role_defaults[role] || []);
  const extraAvailable = Object.entries(caps.capabilities).filter(([k]) => !roleDefaults.has(k));

  const create = async () => {
    setCreating(true);
    setJustCreated(null);
    try {
      const res = await authFetch("/api/auth/create-code", {
        method: "POST",
        json: { role, capabilities: Array.from(extraCaps) },
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        alert(d.detail || d.error || "코드 생성 실패");
      } else {
        setJustCreated({ code: d.code, role: d.role, extras: d.extra_caps || [] });
        setExtraCaps(new Set());
        onChanged();
      }
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (code: string) => {
    if (!confirm(`${code} 비활성화? 이미 가입한 사람은 영향 없음.`)) return;
    const res = await authFetch(`/api/auth/codes/${code}/deactivate`, { method: "POST" });
    if (res.ok) onChanged();
  };

  const copyCode = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      setCopied(s);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* */ }
  };
  const buildInviteUrl = (code: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "https://600g.net";
    return `${base}/auth?code=${code}`;
  };

  return (
    <div className="space-y-3">
      {/* 신규 코드 생성 */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-3">
        <div>
          <div className="text-[12px] text-gray-400 mb-1.5 flex items-center gap-1">
            기본 역할 (프리셋) <InfoTip term="role" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ROLE_PRESETS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setRole(opt.value); setExtraCaps(new Set()); }}
                className={`p-2 text-left rounded border text-[11px] transition-colors ${role === opt.value ? "border-sky-400/60 bg-sky-400/10" : "border-gray-800 hover:border-gray-700"}`}
              >
                <div className="font-bold text-gray-200">{opt.label}</div>
                <div className="text-gray-500 text-[10px] mt-0.5">
                  {(caps.role_defaults[opt.value] || []).length} 개 기본 권한
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 권한 목록 — 전체 노출, 기본은 잠금 (체크된 채로 토글 불가), 추가는 자유 */}
        <div>
          <div className="text-[12px] text-gray-400 mb-1.5 flex items-center gap-1">
            권한 목록 (체크된 건 자동 부여)
            <InfoTip inline={{
              title: "권한 부여",
              body: "🔒 잠금된 체크는 역할 기본 — 이 역할에는 항상 포함. 잠금 해제된 건 추가로 줄 권한 — 체크하면 함께 부여."
            }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {Object.entries(caps.capabilities).map(([key, info]) => {
              const isDefault = roleDefaults.has(key);
              const checked = isDefault || extraCaps.has(key);
              return (
                <label
                  key={key}
                  className={`flex items-start gap-2 p-2 rounded border text-[11px] transition-colors ${
                    isDefault ? "border-sky-400/30 bg-sky-500/5 cursor-default" :
                    checked ? "border-emerald-400/30 bg-emerald-500/5 cursor-pointer" :
                    "border-gray-800 cursor-pointer hover:border-gray-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isDefault}
                    onChange={() => {
                      if (isDefault) return;
                      const s = new Set(extraCaps);
                      if (s.has(key)) s.delete(key);
                      else s.add(key);
                      setExtraCaps(s);
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-200 flex items-center gap-1">
                      {info.label}
                      {isDefault && <span className="text-[9px] text-sky-300">🔒 기본</span>}
                    </div>
                    <div className="text-gray-500 text-[10px]">{info.info}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="text-[11px] text-gray-500">
          ⓘ 1코드 = 1계정. 사용 후 자동 만료. 더 주려면 코드 재발급.
        </div>

        <Button onClick={create} disabled={creating} className="w-full">
          {creating ? "생성 중..." : "🔑 초대코드 생성"}
        </Button>

        {justCreated && (
          <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3 space-y-2">
            <div className="text-[11px] text-emerald-300">✅ 생성 완료 — 사용자한테 이것만 전달:</div>
            <div className="font-mono text-[18px] tracking-widest text-emerald-200 select-all">{justCreated.code}</div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => copyCode(justCreated.code)} className="text-[11px] px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200">
                {copied === justCreated.code ? "✓ 복사됨" : "📋 코드 복사"}
              </button>
              <button onClick={() => copyCode(buildInviteUrl(justCreated.code))} className="text-[11px] px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200">
                🔗 가입 링크 복사
              </button>
            </div>
            {justCreated.extras.length > 0 && (
              <div className="text-[10px] text-gray-400">
                추가 권한: {justCreated.extras.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 기존 코드 목록 */}
      {codes.length > 0 && (
        <div>
          <div className="text-[12px] text-gray-400 mb-2">발급한 코드 ({codes.length})</div>
          <div className="space-y-1">
            {codes.map((c) => (
              <div key={c.code} className={`flex items-center gap-2 p-2 rounded border text-[11px] ${c.active ? "border-gray-800 bg-gray-900/40" : "border-gray-900 bg-gray-900/20 opacity-50"}`}>
                <span className="font-mono font-bold text-gray-200">{c.code}</span>
                <span className="px-1.5 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400">{c.role}</span>
                <span className="text-[10px] text-gray-500">{c.used_count}/{c.max_uses}</span>
                {c.extra_caps && c.extra_caps.length > 0 && (
                  <span className="text-[10px] text-sky-300">+{c.extra_caps.length}</span>
                )}
                {!c.active && <span className="text-[10px] text-red-400">비활성</span>}
                <div className="ml-auto flex gap-1">
                  {c.active && (
                    <>
                      <button onClick={() => copyCode(c.code)} className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                        {copied === c.code ? "✓" : "복사"}
                      </button>
                      <button onClick={() => deactivate(c.code)} className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300">비활성</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
