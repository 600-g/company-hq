"use client";

import { useEffect, useRef, useState } from "react";
import { type Agent } from "@/stores/agentStore";
import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "@/lib/toast";
import { Lock } from "lucide-react";

// 그룹 라벨에 마우스 hover 시 한 줄 설명 (native title — z-index 무관, 가벼움)
const GROUP_HOVER: Record<"system" | "dev" | "agent", string> = {
  system: "두근컴퍼니 운영 자체 (CPO·관리자·스태프·서버실·MD메이커). 프로덕트 없음.",
  dev: "내부 협업 도구 (프론트·백엔드·디자인·QA·콘텐츠랩). 다른 에이전트가 호출해 사용.",
  agent: "프로덕트 (외부 사용자 대상). 자체 GitHub 레포 + 호스팅, 두근컴퍼니 꺼져도 작동.",
};

/** 고정 에이전트 — 그룹 + 그룹 내 정렬 슬롯 (사용자 활동과 무관하게 항상 같은 위치).
 *  시스템: CPO → 관리자(hq-ops) → 스태프
 *  개발: MD메이커 → 프론트엔드 → 백엔드 → 디자인 → 콘텐츠랩 → QA
 */
const FIXED_AGENT_CONFIG: Record<string, { group: "system" | "dev" | "agent"; slot: number }> = {
  // 시스템 그룹
  "cpo-claude": { group: "system", slot: 1 },
  "hq-ops":     { group: "system", slot: 2 },
  "staff":      { group: "system", slot: 3 },
  // 개발 그룹 (MD메이커 포함)
  "agent-6d883e":  { group: "dev", slot: 11 },
  "frontend-team": { group: "dev", slot: 12 },
  "backend-team":  { group: "dev", slot: 13 },
  "design-team":   { group: "dev", slot: 14 },
  "content-lab":   { group: "dev", slot: 15 },
  "qa-agent":      { group: "dev", slot: 16 },
};

/** 에이전트의 사이드바 그룹 분류 — FIXED_AGENT_CONFIG 우선, 없으면 roleGroup, 마지막은 id 기반 default */
export function groupOfAgent(a: Agent): "system" | "dev" | "agent" {
  const fixed = FIXED_AGENT_CONFIG[a.id];
  if (fixed) return fixed.group;
  if (a.roleGroup === "system" || a.roleGroup === "dev" || a.roleGroup === "agent") return a.roleGroup;
  if (a.id === "server-monitor") return "system";
  if (a.id.startsWith("agent-")) return "agent";
  return "dev";
}

const GROUP_META: Record<"system" | "dev" | "agent", { emoji: string; label: string; bg: string }> = {
  system: { emoji: "🛠", label: "시스템", bg: "bg-sky-500/8" },
  dev:    { emoji: "💻", label: "개발",   bg: "bg-emerald-500/5" },
  agent:  { emoji: "🤖", label: "에이전트", bg: "" },
};

const SIDEBAR_GROUPS_KEY = "doogeun-hq-sidebar-groups";
function getCollapsedGroups(): Record<"system" | "dev" | "agent", boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(SIDEBAR_GROUPS_KEY) || "{}");
    return {
      system: !!v.system,
      dev: !!v.dev,
      agent: !!v.agent,
    };
  } catch {
    return { system: false, dev: false, agent: false };
  }
}

const PINNED_KEY = "doogeun-hq-pinned-agents";
function getPinned(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || "[]")); }
  catch { return new Set(); }
}

const AGENT_SITES: Record<string, { url: string; title: string }> = {
  "ai900": { url: "https://600-g.github.io/exam-hub/", title: "🔗 시험 준비 사이트 (AI-900 + SQLD)" },
};

interface AgentSelectorProps {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStaffStatsClick?: () => void;
  onTimelineClick?: () => void;
  onContextMenu?: (agentId: string, x: number, y: number) => void;
}

export default function AgentSelector({
  agents,
  selectedId,
  onSelect,
  onStaffStatsClick,
  onTimelineClick,
  onContextMenu,
}: AgentSelectorProps) {
  const streamingByTeam = useChatStore((s) => s.streamingByTeam);
  const unreadByTeam = useChatStore((s) => s.unreadByTeam);
  const lastActiveByTeam = useChatStore((s) => s.lastActiveByTeam);
  const myRole = useAuthStore((s) => s.user?.role || "guest");
  const isAdmin = myRole === "owner" || myRole === "admin";

  /** 시스템/개발 에이전트는 admin 전용 채팅 — 사원/게스트는 보이지만 클릭 시 토스트. */
  const isLockedForMe = (a: Agent): boolean => {
    if (isAdmin) return false;
    const fixed = FIXED_AGENT_CONFIG[a.id];
    if (fixed?.group === "system" || fixed?.group === "dev") return true;
    return false;
  };

  const handleAgentClick = (a: Agent) => {
    if (isLockedForMe(a)) {
      toast(
        "이 에이전트는 관리자 오케스트레이션 전용입니다. 본인의 에이전트를 만들어 사용하세요.",
        "warn",
        4000
      );
      return;
    }
    onSelect(a.id);
  };
  const [collapsed, setCollapsed] = useState<Record<"system" | "dev" | "agent", boolean>>(() =>
    typeof window !== "undefined" ? getCollapsedGroups() : { system: false, dev: false, agent: false }
  );
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(() =>
    typeof window !== "undefined" ? getPinned() : new Set()
  );
  const toggleGroup = (g: "system" | "dev" | "agent") => {
    setCollapsed((prev) => {
      const next = { ...prev, [g]: !prev[g] };
      try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(next)); } catch {/* */}
      return next;
    });
  };
  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(PINNED_KEY, JSON.stringify([...next])); } catch {/* */}
      return next;
    });
  };

  // hidden=true (외부 호스팅 운영 프로덕트) 는 사이드바에서도 숨김. 검색해도 안 보임.
  const filtered = agents.filter((a) => a.id !== "staff" && a.id !== "hq-ops" && !a.hidden);
  const staffAgent = agents.find((a) => a.id === "staff");
  const hqOpsAgent = agents.find((a) => a.id === "hq-ops");
  const virtualStaff = staffAgent ?? ({ id: "staff", name: "스태프", emoji: "🧑‍💼", role: "special", roleGroup: "system", status: "idle", floor: 1, description: "", systemPromptMd: "", createdAt: 0, updatedAt: 0, activity: [] } as Agent);
  const virtualHqOps = hqOpsAgent ?? ({ id: "hq-ops", name: "두근컴퍼니 관리자", emoji: "📊", role: "special", roleGroup: "system", status: "idle", floor: 1, description: "", systemPromptMd: "", createdAt: 0, updatedAt: 0, activity: [] } as Agent);

  const q = query.trim().toLowerCase();
  const matched = (a: Agent) => !q ||
    a.name.toLowerCase().includes(q) ||
    (a.role || "").toLowerCase().includes(q) ||
    (a.emoji || "").includes(q);

  const allOrdered: Agent[] = [virtualHqOps, virtualStaff, ...filtered].filter(matched);
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const sortKey = (a: Agent): number => {
    // 고정 에이전트는 슬롯 그대로 — 항상 같은 위치 (활동·핀 무관)
    const fixed = FIXED_AGENT_CONFIG[a.id];
    if (fixed) return fixed.slot;
    // 비고정 (사용자가 만든 에이전트만): 활동 기준
    const last = lastActiveByTeam[a.id] || 0;
    if (pinned.has(a.id)) return 100;
    if (now - last < DAY) return 101;
    if (last && now - last > 30 * DAY) return 103;
    return 102;
  };
  allOrdered.sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    if (ka !== kb) return ka - kb;
    return (lastActiveByTeam[b.id] || 0) - (lastActiveByTeam[a.id] || 0);
  });
  const groups: Record<"system" | "dev" | "agent", Agent[]> = { system: [], dev: [], agent: [] };
  for (const a of allOrdered) {
    groups[groupOfAgent(a)].push(a);
  }

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-agent-id="${selectedId}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, agents.length]);

  const renderRow = (a: Agent) => {
    const active = selectedId === a.id;
    const streaming = !!streamingByTeam[a.id];
    const unread = unreadByTeam[a.id] ?? 0;
    const isStaff = a.id === "staff";
    const isHqOps = a.id === "hq-ops";
    const isAdminLine = isStaff || isHqOps;
    const isPinned = pinned.has(a.id);
    const locked = isLockedForMe(a);
    return (
      <div key={a.id} data-agent-id={a.id} className={`flex w-full ${isAdminLine ? "border-b border-sky-500/25 bg-sky-500/5" : ""}`}>
        <button
          onClick={() => handleAgentClick(a)}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(a.id, e.clientX, e.clientY); }}
          title={locked ? "관리자 오케스트레이션 전용 — 채팅 불가" : undefined}
          className={`flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] transition-colors ${
            locked ? "text-gray-500 cursor-not-allowed hover:bg-gray-800/20" :
            active ? "bg-sky-500/15 text-sky-100" : "text-gray-300 hover:bg-gray-800/40"
          }`}
        >
          <span className={`text-sm leading-none shrink-0 ${locked ? "opacity-50" : ""}`}>{a.emoji}</span>
          <span className={`flex-1 min-w-0 truncate ${active ? "font-bold" : ""}`}>{a.name}</span>
          {locked && <Lock className="w-3 h-3 text-gray-600 shrink-0" />}
          {streaming ? (
            <span className="flex items-center gap-0.5 text-[9px] text-amber-300 shrink-0">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            </span>
          ) : unread > 0 && !active ? (
            <span className="text-[9px] px-1 rounded-full bg-red-500/80 text-white font-bold shrink-0">{unread}</span>
          ) : null}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); togglePin(a.id); }}
          className={`shrink-0 w-6 flex items-center justify-center text-[11px] transition-colors border-l border-gray-800/60 ${
            isPinned ? "text-amber-300" : "text-gray-700 hover:text-amber-300"
          }`}
          title={isPinned ? "핀 해제" : "최상단 고정"}
        >
          {isPinned ? "★" : "☆"}
        </button>
        {isHqOps && (
          <button
            onClick={(e) => { e.stopPropagation(); onTimelineClick?.(); }}
            className="shrink-0 w-7 flex items-center justify-center text-[12px] transition-colors text-sky-400 hover:bg-sky-500/15 hover:text-sky-200 border-l border-gray-800/60"
            title="📚 책장"
          >
            📚
          </button>
        )}
        {isStaff && (
          <button
            onClick={(e) => { e.stopPropagation(); onStaffStatsClick?.(); }}
            className="shrink-0 w-7 flex items-center justify-center text-[12px] transition-colors text-amber-300 hover:bg-amber-500/15 hover:text-amber-100 border-l border-gray-800/60"
            title="📊 스태프 통계 — Claude 토큰 절감 / 무료 LLM 사용"
          >
            📊
          </button>
        )}
        {AGENT_SITES[a.id] && (
          <a
            href={AGENT_SITES[a.id].url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 w-7 flex items-center justify-center text-[12px] transition-colors text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-100 border-l border-gray-800/60"
            title={AGENT_SITES[a.id].title}
          >
            🔗
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-2 border-b border-gray-800/60 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 팀 검색..."
            className="w-full h-7 px-2 rounded-md text-[11px] bg-gray-900/60 border border-gray-800 text-gray-200 placeholder:text-gray-600 focus:border-sky-400/60 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 px-1 text-[12px]"
              title="검색 지우기"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {(["system", "dev", "agent"] as const).map((g) => {
          const meta = GROUP_META[g];
          const list = groups[g];
          const isCollapsed = collapsed[g];
          if (list.length === 0) return null;
          // 프로덕트(agent 그룹)는 검색 중에만 사이드바 표시 — 평소엔 [📁 프로덕트] 모달로 접근
          // 단, 현재 선택된 에이전트가 그 그룹이면 화면에 표시 (선택 추적용)
          if (g === "agent" && !q && !list.some((a) => a.id === selectedId)) return null;
          return (
            <div key={g}>
              <button
                onClick={() => toggleGroup(g)}
                title={GROUP_HOVER[g]}
                className={`w-full flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-200 hover:bg-gray-900/40 transition-colors ${meta.bg}`}
              >
                <span className={`text-[9px] transition-transform ${isCollapsed ? "" : "rotate-90"}`}>▶</span>
                <span>{meta.emoji} {meta.label}</span>
                <span className="text-[9px] font-mono text-gray-600 ml-auto">{list.length}</span>
              </button>
              {!isCollapsed && list.map(renderRow)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
