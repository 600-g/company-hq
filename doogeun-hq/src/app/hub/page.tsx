"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Modal from "@/components/Modal";
import Weather, { useWeatherStore } from "@/components/Weather";
import { useAgentStore, type Agent } from "@/stores/agentStore";
import { useAuthStore } from "@/stores/authStore";
import { apiBase } from "@/lib/utils";
import {
  X, Users, Bug, Cpu, Settings, LogOut, Send,
  MessagesSquare, Plus, Home as HomeIcon, RefreshCw, ChevronRight, ChevronLeft,
  Grid3x3, Pencil, Terminal as TerminalIcon, Copy, Check, Trash2, Globe,
} from "lucide-react";
import SitesModal from "@/components/hub/SitesModal";
import DebugPanel, { LogsPane } from "@/components/DebugPanel";
import VersionBadge from "@/components/VersionBadge";
import { useVersionStore } from "@/stores/versionStore";
import MentionPopup from "@/components/chat/MentionPopup";
import TerminalPanel from "@/components/TerminalPanel";
import FurniturePalette from "@/components/office/FurniturePalette";
import { useLayoutStore } from "@/stores/layoutStore";
import { useSettingsStore } from "@/stores/settingsStore";
import AgentConfigModal from "@/components/AgentConfigModal";
import StaffStatsModal from "@/components/StaffStatsModal";
import AgentSelector from "@/components/AgentSelector";
import BugsBody from "@/components/hub/Bugs";
import LabBody from "@/components/hub/Lab";
import AgentsModalBody, { NewAgentBody } from "@/components/hub/AgentsModal";
import { WorkingAgentsStrip, SideItem } from "@/components/hub/Sidebar";
const TimelineModal = dynamic(() => import("@/components/TimelineModal"), { ssr: false });
import PhaserLoadingOverlay from "@/components/PhaserLoadingOverlay";
import AgentContextMenu from "@/components/AgentContextMenu";
import AgentActivityModal from "@/components/AgentActivityModal";
import SessionHistoryPanel from "@/components/chat/SessionHistoryPanel";
import ServerDashboard from "@/components/ServerDashboard";
import { useThemeStore } from "@/stores/themeStore";
import AgentCreate from "@/components/AgentCreate";
import { useConfirm } from "@/components/Confirm";
import { initDiag, getRecentLogs } from "@/lib/diag";
import { ensureNotifyPermission, showLocalNotify } from "@/lib/pushNotify";
import { useBudgetWarning } from "@/lib/useBudgetWarning";
import { usePushSubscribe } from "@/lib/usePushSubscribe";
import { useStateSync } from "@/lib/useStateSync";
import BudgetBadge from "@/components/BudgetBadge";
import { BellButton } from "@/components/NotifyRoot";
import { useNotifStore } from "@/stores/notifyStore";
import AgentResultCard from "@/components/chat/AgentResultCard";
import AgentHandoffCard from "@/components/chat/AgentHandoffCard";
import DeployGuideCard from "@/components/chat/DeployGuideCard";
import { useChatWs, type WsMessage, type ToolEntry, type HandoffPayload, onBackgroundComplete } from "@/lib/useChatWs";
import { useChatStore } from "@/stores/chatStore";
import { buildFixErrorPrompt } from "@/lib/validateOutput";
import { usePipelineStore } from "@/stores/pipelineStore";
import { useHandoffStore } from "@/stores/handoffStore";
import PipelineDAG from "@/components/chat/PipelineDAG";
import WorkingStatusBar from "@/components/WorkingStatusBar";
import { refineRequest } from "@/lib/refineRequest";
import { Rocket } from "lucide-react";

const HubOffice = dynamic(() => import("@/components/HubOffice"), { ssr: false });

interface HubMsg {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  agentEmoji?: string;
  agentName?: string;
  ts: number;
  images?: string[];  // data URLs (사용자 메시지 첨부)
}

type ModalKey = null | "agents" | "server" | "bugs" | "settings" | "newAgent" | "staff-stats" | "lab" | "timeline" | "sites";

export default function HubPage() {
  const router = useRouter();
  const agents = useAgentStore((s) => s.agents);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const fetchWx = useWeatherStore((s) => s.fetch);
  const tod = useWeatherStore((s) => s.tod);
  const ambientTint = useWeatherStore((s) => s.ambientTint);

  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const editMode = useLayoutStore((s) => s.editMode);
  const setEditMode = useLayoutStore((s) => s.setEditMode);
  const autoDeploy = useSettingsStore((s) => s.autoDeploy);
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const configAgent = agents.find((a) => a.id === configAgentId) ?? null;
  const [ctxMenu, setCtxMenu] = useState<{ agentId: string; x: number; y: number } | null>(null);
  const [activityAgentId, setActivityAgentId] = useState<string | null>(null);
  const removeAgentFn = useAgentStore((s) => s.removeAgent);
  const askConfirm = useConfirm();
  useBudgetWarning();
  usePushSubscribe();
  useStateSync(); // 서버 동기화 (HTTP-only, WS 없음) — 캐시 지워도 서버에서 복원

  // 오피스에서 에이전트 우클릭 시 컨텍스트 메뉴
  useEffect(() => {
    const onCtx = (e: Event) => {
      const d = (e as CustomEvent).detail as { agentId: string; clientX: number; clientY: number } | undefined;
      if (!d) return;
      setCtxMenu({ agentId: d.agentId, x: d.clientX, y: d.clientY });
    };
    window.addEventListener("hq:agent-ctx", onCtx as EventListener);
    return () => window.removeEventListener("hq:agent-ctx", onCtx as EventListener);
  }, []);
  const [chatOpen, setChatOpen] = useState(true);
  const [floor, setFloor] = useState(1);
  const changeFloor = (next: number) => setFloor(next);
  const [modalKey, setModalKey] = useState<ModalKey>(null);

  // 테마 저장된 값 HTML 속성에 반영 (persist hydrate 이후)
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 푸시 알림 deeplink — /hub?openUpdate=1 진입 시 업데이트 모달 강제 열림
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("openUpdate") === "1") {
      try {
        // dismissedCommit 리셋 → VersionBanner 가 미반영 commit 있으면 모달 자동 표시
        useVersionStore.getState().reopen();
      } catch {/* */}
      // URL 정리 (다음 새로고침엔 안 뜨게)
      const url = new URL(window.location.href);
      url.searchParams.delete("openUpdate");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [celebrate, setCelebrate] = useState<{ emoji: string; name: string; phase: "in" | "out" } | null>(null);
  // 입력 영속화 — 새로고침/배포 reload 시에도 작성 중인 메시지 보존
  const [input, setInput] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("doogeun-hq-draft-input") || ""; } catch { return ""; }
  });
  useEffect(() => {
    try { localStorage.setItem("doogeun-hq-draft-input", input); } catch { /* ignore */ }
  }, [input]);
  const [composing, setComposing] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [refineHints, setRefineHints] = useState<string[] | null>(null);
  const [showDeploy, setShowDeploy] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const notifyPush = useNotifStore((s) => s.push);
  const selected = agents.find((a) => a.id === selectedAgentId) ?? null;

  // WebSocket 실시간 채팅 (스트리밍 + tool_use + handoff)
  const { messages: wsMessages, send: wsSend, sendDirect: wsSendDirect, streaming: wsStreaming, connected: wsConnected, toolStatus } = useChatWs({
    teamId: selected?.id ?? null,
    agentEmoji: selected?.emoji,
    agentName: selected?.name,
    onHandoff: (h: HandoffPayload) => {
      notifyPush("warning", "핸드오프 승인 필요", `${h.steps?.length || 0}팀 전달 검토`, "dispatch");
      // 파이프라인 상태 시작 (pending)
      const spec = h.steps?.[0]?.prompt ?? "핸드오프";
      usePipelineStore.getState().start(
        spec,
        (h.steps || []).map((s) => ({
          agentId: s.team,
          agentName: s.team_name,
          agentEmoji: s.emoji,
          prompt: s.prompt,
        })),
        h.dispatch_id,
      );
    },
    // 도구 사용 (Bash/Read/Write 등) 은 토스트 노출 X — 너무 자주 발생해 알림 폭주 유발.
    //   채팅 패널의 메시지 카드 안에 m.tools 로 이미 인라인 표시되니 거기서 확인 가능.
    //   디버깅 시 콘솔 로그로만 남김.
    onToolUse: (t: ToolEntry) => {
      if (typeof console !== "undefined") {
        console.debug("[tool]", t.tool, t.summary?.slice?.(0, 80) || "");
      }
    },
  });

  const [dragOver, setDragOver] = useState(false);
  const MAX_TEXT_BYTES = 120_000;

  const addImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedImages((p) => [...p, reader.result as string].slice(0, 4));
    reader.readAsDataURL(file);
  };

  const addAnyFile = async (file: File) => {
    if (file.type.startsWith("image/")) { addImage(file); return; }
    // 텍스트류 (md/json/txt/code) → 입력창에 코드블록으로 첨부
    const textLike = /\.(md|markdown|txt|json|yaml|yml|csv|tsv|log|js|ts|tsx|jsx|py|go|rs|java|kt|swift|php|rb|sh|html|css|xml|toml|ini)$/i;
    const isText = file.type.startsWith("text/") || textLike.test(file.name);
    if (!isText) return;
    if (file.size > MAX_TEXT_BYTES) return;
    const txt = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const block = `\n\n\`\`\`${ext} title=${file.name}\n${txt.slice(0, MAX_TEXT_BYTES)}\n\`\`\`\n`;
    setInput((p) => p + block);
  };

  const handleAsidePaste = (e: React.ClipboardEvent) => {
    let handled = false;
    for (const it of Array.from(e.clipboardData.items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) { addAnyFile(f); handled = true; }
      }
    }
    if (handled) e.preventDefault();
  };

  const handleAsideDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    for (const f of Array.from(e.dataTransfer.files)) addAnyFile(f);
  };

  useEffect(() => { fetchWx(); initDiag(); }, [fetchWx]);

  // 백그라운드 완료 알림 — 비선택 팀에서 작업 끝나면 토스트/데스크톱 알림 + unread 증가
  useEffect(() => {
    onBackgroundComplete((teamId, preview) => {
      const team = useAgentStore.getState().agents.find((a) => a.id === teamId);
      if (!team) return;
      const currentSelected = selectedAgentId;
      if (currentSelected === teamId) return; // 지금 보는 팀이면 UI 에 이미 보임
      useChatStore.getState().markUnread(teamId, 1);
      notifyPush("success", `${team.emoji} ${team.name} 완료`, preview, team.name);
      // 다른 팀이 끝났으니 무조건 데스크톱 알림 (탭 포커스 무관)
      showLocalNotify({
        title: `${team.emoji} ${team.name} · 작업 완료`,
        body: preview || "결과 확인 필요",
        tag: `bg-${teamId}`,
        url: "/hub",
      });
    });
  }, [selectedAgentId, notifyPush]);

  // 팀 선택 시 해당 팀 unread + 관련 토스트/알림 자동 읽음 처리
  useEffect(() => {
    if (!selectedAgentId) return;
    const team = useAgentStore.getState().agents.find((a) => a.id === selectedAgentId);
    if (!team) return;
    useChatStore.getState().clearUnread(selectedAgentId);
    // 해당 팀이 source 인 미읽음 알림 항목 일괄 읽음
    const items = useNotifStore.getState().items;
    items.forEach((it) => {
      if (!it.read && (it.source === team.name || it.source === selectedAgentId)) {
        useNotifStore.getState().markRead(it.id);
      }
    });
  }, [selectedAgentId]);

  // 매 마운트마다: 에이전트 없으면 import, 1F 아닌 에이전트는 전부 1F 강제 이동
  useEffect(() => {
    (async () => {
      try {
        const { importTeamsFromServer } = await import("@/lib/importTeams");
        let agentsNow = useAgentStore.getState().agents;
        if (agentsNow.length === 0) {
          const r = await importTeamsFromServer();
          if (r.added > 0) {
            notifyPush("success", "에이전트 자동 가져옴", `${r.added}팀 · MD ${r.promptsFetched}개`, "import");
          }
          agentsNow = useAgentStore.getState().agents;
        }
        // 전원 1F 로 강제 (유저 수동 변경한 것은 편집 모달에서 가능 — 이건 첫 화면 일관성 우선)
        const state = useAgentStore.getState();
        agentsNow.forEach((a) => {
          if ((a.floor ?? 1) !== 1) {
            state.updateAgent(a.id, { floor: 1, position: undefined });
          }
        });
      } catch (err) {
        console.warn("[hub] agent init 실패:", err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [wsMessages]);

  const messages = wsMessages;
  const sending = wsStreaming;
  const prevStreamingRef = useRef(false);

  // 스트리밍 종료 시 로컬 알림 (탭 백그라운드일 때만) + 자동 배포 트리거
  useEffect(() => {
    if (prevStreamingRef.current && !wsStreaming && selected) {
      const last = wsMessages[wsMessages.length - 1];
      if (last?.role === "agent") {
        const preview = last.content.slice(0, 120).replace(/\n+/g, " ");
        // 현재 보고 있는 팀의 응답이면 탭 포커스 시 데스크톱 알림 스킵 (이미 화면에 표시됨)
        showLocalNotify({
          title: `${selected.emoji} ${selected.name} · 응답 완료`,
          body: preview || "결과 확인",
          tag: `agent-${selected.id}`,
          url: "/hub",
        }, { skipIfFocused: true });
        // 자동 배포 — 툴 사용이 있었고(= 실제 파일 변경 가능성) + 에러 없을 때만
        if (autoDeploy && last.tools && last.tools.length > 0) {
          const hasError = last.tools.some((t) => t.error);
          const hasWrite = last.tools.some((t) => /write|edit|bash/i.test(t.tool));
          if (!hasError && hasWrite && selected.githubRepo) {
            notifyPush("info", "🚀 자동 배포 시작", "파일 변경 감지 — GitHub 푸시", selected.name);
            setShowDeploy(true); // 배포 카드 자동 펼침
            // 300ms 후 배포 API 자동 호출
            setTimeout(() => {
              fetch(`${apiBase()}/api/deploy/project/${selected.id}/github`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: `auto: ${last.content.slice(0, 60).replace(/\n/g, " ")}` }),
              }).catch(() => {});
            }, 300);
          }
        }
      }
    }
    prevStreamingRef.current = wsStreaming;
  }, [wsStreaming, selected, wsMessages, autoDeploy, notifyPush]);

  // 알림 권한 1회 요청 (agents 있을 때)
  useEffect(() => {
    if (agents.length > 0 && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      const timer = setTimeout(() => { ensureNotifyPermission(); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [agents.length]);

  const send = () => {
    if ((!input.trim() && attachedImages.length === 0) || !selected) return;
    // refine 검사 (경량)
    const r = refineRequest(input);
    if (r.needsClarify && attachedImages.length === 0) {
      setRefineHints([...r.questions, ...r.hints]);
      return;
    }
    setRefineHints(null);
    wsSend(input, attachedImages.length > 0 ? [...attachedImages] : undefined);
    setInput("");
    setAttachedImages([]);
  };

  const forceSend = () => {
    setRefineHints(null);
    wsSend(input, attachedImages.length > 0 ? [...attachedImages] : undefined);
    setInput("");
    setAttachedImages([]);
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* 좌측 사이드 — collapsible (아이콘 only ↔ 풀) */}
      <aside
        className={`shrink-0 flex flex-col border-r border-gray-800/70 bg-[#0b0b14] transition-[width] duration-200 ${
          sideCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="h-12 flex items-center justify-between border-b border-gray-800/60 px-3 shrink-0">
          {!sideCollapsed && (
            <Link href="/" className="flex items-center gap-1.5 text-[13px] font-bold text-sky-300 hover:text-gray-200">
              <HomeIcon className="w-3.5 h-3.5" />
              <span className="truncate">두근컴퍼니</span>
            </Link>
          )}
          <button
            onClick={() => setSideCollapsed((v) => !v)}
            className={`text-gray-500 hover:text-gray-200 ${sideCollapsed ? "mx-auto" : ""}`}
            title={sideCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {sideCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          <SideItem
            collapsed={sideCollapsed}
            icon={Users}
            label="에이전트"
            badge={agents.length}
            onClick={() => setModalKey("agents")}
          />
          <WorkingAgentsStrip collapsed={sideCollapsed} onSelect={(id) => { setSelectedAgentId(id); setChatOpen(true); }} />
          <SideItem collapsed={sideCollapsed} icon={Globe} label="외부 사이트" onClick={() => setModalKey("sites")} />
          <SideItem collapsed={sideCollapsed} icon={Cpu} label="서버실" onClick={() => setModalKey("server")} />
          <SideItem collapsed={sideCollapsed} icon={Bug} label="연구소" onClick={() => setModalKey("lab")} />
          <SideItem collapsed={sideCollapsed} icon={Settings} label="설정" onClick={() => router.push("/settings")} />
          <div className="h-px bg-gray-800/60 my-2" />
          {/* 메모리 정리 → 서버실(ServerDashboard) 의 메모리 게이지 클릭으로 통합. 별도 메뉴 제거 */}
          <SideItem collapsed={sideCollapsed} icon={RefreshCw} label="강제 새로고침" onClick={() => {
            // 모든 doogeun-hq-* 영속 데이터(layout/chat/theme/notify/...) 보존.
            // 비-앱 키(next 캐시 등) 만 제거
            Object.keys(localStorage).forEach((k) => {
              if (!k.startsWith("doogeun-hq-")) localStorage.removeItem(k);
            });
            location.reload();
          }} />
        </nav>

        {/* 버전 배지 — 오너 정보 바로 위 */}
        <VersionBadge collapsed={sideCollapsed} />

        {/* 하단: 오너 정보 + 로그아웃 */}
        <div className="border-t border-gray-800/60">
          {!sideCollapsed ? (
            <div className="p-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-gray-200 font-bold truncate">
                  {user ? user.nickname : "게스트"}
                </div>
                {user?.role && (
                  <div className="text-[10px] text-gray-500 truncate">{user.role}</div>
                )}
              </div>
              <button
                onClick={() => { if (user) { logout(); router.push("/"); } else router.push("/auth"); }}
                className="p-1.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-red-300 shrink-0"
                title={user ? "로그아웃" : "로그인"}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { if (user) { logout(); router.push("/"); } else router.push("/auth"); }}
              className="w-full p-3 flex items-center justify-center text-gray-500 hover:text-red-300 hover:bg-gray-800/40"
              title={user ? `${user.nickname} — 로그아웃` : "로그인"}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* 중앙 메인 — 오피스. 모바일(<md)에서는 숨기고 채팅창이 풀스크린이 되게 */}
      <main className="hidden md:flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* 상단 얇은 바 — 날씨 + 알림 벨 */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-800/60 shrink-0">
          <Weather compact />
          <div className="flex items-center gap-1.5">
            <BudgetBadge />
            <BellButton />
          </div>
        </div>

        {/* 오피스 캔버스 + 층 선택 — 최대한 확대, 빈 공간 최소 */}
        <div className="flex-1 flex items-stretch p-2 overflow-hidden relative gap-2">
          {/* 층 세로 스택 — 오피스 왼쪽 */}
          <div className="flex flex-col gap-2 shrink-0 self-center">
            {[1, 2, 3].map((f) => {
              const floorAgents = agents.filter((a) => (a.floor ?? 1) === f).length;
              return (
                <button
                  key={f}
                  onClick={() => changeFloor(f)}
                  className={`h-11 w-11 flex flex-col items-center justify-center rounded-md text-[13px] font-bold ${
                    floor === f
                      ? "bg-sky-500/15 text-gray-100 border border-sky-400/50"
                      : "border border-gray-800 text-gray-400 hover:text-gray-100 hover:border-gray-600 bg-gray-900/40"
                  }`}
                  title={`${f}층 — ${floorAgents}명`}
                >
                  <span>{f}F</span>
                  {floorAgents > 0 && <span className="text-[9px] text-gray-500 font-normal leading-none mt-0.5">{floorAgents}</span>}
                </button>
              );
            })}
          </div>

          {/* 캔버스 — 게임 월드 1280×800 과 픽셀 1:1 매핑 (border 제거, aspect containerRef로 이전) */}
          <div className="flex-1 flex items-center justify-center min-w-0 min-h-0">
            <div
              className="relative rounded-xl bg-[#06060e] overflow-hidden shadow-2xl outline outline-1 outline-gray-800/60"
              style={{
                width: "100%",
                height: "100%",
                maxWidth: "1400px",
                maxHeight: "100%",
                aspectRatio: "1280/800",  /* 게임 월드와 동일 — 레터박스 완전 제거 */
              }}
            >
              <HubOffice floor={floor} agentCount={agents.length} />
              <WorkingStatusBar />
              <PhaserLoadingOverlay />
              <div
                className="absolute inset-0 pointer-events-none transition-colors duration-[2s]"
                style={{ background: ambientTint }}
              />
              {/* 스태프 버튼 — 에이전트 목록에 있으므로 씬 상단에서 제거.
                  통계는 에이전트 우클릭 또는 staff 채팅창에서 확인. */}

              {/* 오피스 편집 버튼 — 좌상단 모서리 (씬 위 오버레이) */}
              <button
                onClick={() => setEditMode(!editMode)}
                className={`absolute top-2 left-2 z-30 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all border backdrop-blur ${
                  editMode
                    ? "bg-amber-500/90 border-amber-300 text-gray-900 shadow-lg"
                    : "bg-gray-900/70 border-gray-600 text-gray-200 hover:bg-gray-800/90 hover:border-amber-400/50"
                }`}
                title={editMode ? "편집 종료" : "오피스 편집"}
              >
                <Pencil size={12} />
                {editMode ? "종료" : "편집"}
              </button>
            </div>
          </div>

          {/* 가구 팔레트 — 오피스 밖 우측 사이드 컬럼 (편집 모드만) */}
          {editMode && (
            <div className="shrink-0 w-80 self-stretch flex">
              <FurniturePalette floor={floor} onClose={() => setEditMode(false)} />
            </div>
          )}
        </div>

      </main>

      {/* 중앙 에이전트 목록 column — 씬과 채팅창 사이. 검색·핀·3그룹 토글 */}
      <aside className="hidden md:flex shrink-0 flex-col w-[220px] border-l border-gray-800/70 bg-[#0b0b14] overflow-hidden">
        <AgentSelector
          agents={agents}
          selectedId={selectedAgentId}
          onSelect={(id) => { setSelectedAgentId(id); setChatOpen(true); }}
          onStaffStatsClick={() => setModalKey("staff-stats")}
          onTimelineClick={() => setModalKey("timeline")}
          onContextMenu={(id, x, y) => setCtxMenu({ agentId: id, x, y })}
        />
      </aside>

      {/* 우측 채팅 패널 — collapsible */}
      <aside
        className={`relative shrink-0 flex flex-col md:border-l transition-[width,border-color] duration-200 bg-[#0b0b14] flex-1 md:flex-none ${
          chatOpen ? "md:w-[480px] w-full" : "md:w-0 w-full md:overflow-hidden"
        } overflow-hidden ${
          dragOver ? "border-sky-400 ring-2 ring-sky-400/40" : "border-gray-800/70"
        }`}
        onDragEnter={(e) => { if (e.dataTransfer.types.includes("Files")) setDragOver(true); }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={(e) => {
          // aside 자체를 벗어날 때만 해제 (내부 자식 이동 무시)
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDrop={handleAsideDrop}
        onPaste={handleAsidePaste}
      >
        {dragOver && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-sky-500/10 backdrop-blur-[1px]">
            <div className="px-4 py-2 rounded-lg bg-gray-950/85 border border-sky-400/60 text-[13px] text-sky-200 font-bold flex items-center gap-2">
              📎 파일 놓아주세요 · 이미지 / MD / 코드 지원
            </div>
          </div>
        )}
        <div className="h-12 flex items-center justify-between px-3 border-b border-gray-800/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessagesSquare className="w-4 h-4 text-sky-300 shrink-0" />
            <span className="text-[13px] font-bold text-gray-200 truncate">
              {selected ? `${selected.emoji} ${selected.name}` : "채팅"}
            </span>
            {selected && (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${wsConnected ? "bg-green-400" : "bg-amber-400 animate-pulse"}`} title={wsConnected ? "WS 연결됨" : "재연결 중..."} />
            )}
          </div>
          <div className="flex items-center gap-1">
            {selected && messages.length > 0 && (
              <button
                onClick={async () => {
                  const ok = await askConfirm({
                    title: "현재 채팅 비우기",
                    message: `${selected.name} 팀의 화면 채팅 ${messages.length}개를 지웁니다.\n\n• 서버 chat_history (영구 기록) 는 그대로 유지\n• 새 세션 시작하면 처음부터 다시 시작\n\n계속할까요?`,
                    confirmText: "비우기",
                    destructive: true,
                  });
                  if (!ok) return;
                  useChatStore.getState().clearMessages(selected.id);
                  notifyPush("info", "채팅 비움", `${selected.name} 화면 메시지 정리됨`, selected.name);
                }}
                className="h-7 px-2 rounded-md text-[11px] transition-colors flex items-center gap-1 text-gray-400 hover:text-red-300 hover:bg-red-500/10"
                title="현재 화면 채팅 비우기 (서버 기록은 유지)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                지우기
              </button>
            )}
            {selected && messages.length > 0 && (
              <button
                onClick={async () => {
                  const text = messages
                    .filter((m) => m.role === "user" || m.role === "agent")
                    .map((m) => {
                      const who = m.role === "user" ? "🧑 나" : `${selected.emoji} ${selected.name}`;
                      const ts = m.ts ? new Date(m.ts).toLocaleString("ko-KR", { hour12: false }) : "";
                      return `[${who}${ts ? ` · ${ts}` : ""}]\n${(m.content ?? "").trim()}`;
                    })
                    .join("\n\n");
                  try {
                    await navigator.clipboard.writeText(text);
                    setCopiedFlash(true);
                    setTimeout(() => setCopiedFlash(false), 1500);
                  } catch {
                    // clipboard API 차단 환경 폴백
                    const ta = document.createElement("textarea");
                    ta.value = text;
                    ta.style.position = "fixed"; ta.style.opacity = "0";
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand("copy"); setCopiedFlash(true); setTimeout(() => setCopiedFlash(false), 1500); } catch {}
                    document.body.removeChild(ta);
                  }
                }}
                className={`h-7 px-2 rounded-md text-[11px] transition-colors flex items-center gap-1 ${
                  copiedFlash ? "bg-green-500/15 text-green-200" : "text-gray-400 hover:text-sky-200 hover:bg-gray-800/40"
                }`}
                title={`${selected.name} 대화 전체 복사 (${messages.length}개 메시지)`}
              >
                {copiedFlash ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedFlash ? "복사됨" : "복사"}
              </button>
            )}
            {selected && (
              <button
                onClick={() => setShowSessions((v) => !v)}
                className={`h-7 px-2 rounded-md text-[11px] transition-colors flex items-center gap-1 ${
                  showSessions ? "bg-sky-500/15 text-sky-200" : "text-gray-400 hover:text-sky-200 hover:bg-gray-800/40"
                }`}
                title="세션 리스트"
              >
                <MessagesSquare className="w-3.5 h-3.5" />
                세션
              </button>
            )}
            {selected && (
              <button
                onClick={() => setShowDeploy((v) => !v)}
                className={`h-7 px-2 rounded-md text-[11px] transition-colors flex items-center gap-1 ${
                  showDeploy ? "bg-sky-500/15 text-sky-200" : "text-gray-400 hover:text-sky-200 hover:bg-gray-800/40"
                }`}
                title="배포 가이드"
              >
                <Rocket className="w-3.5 h-3.5" />
                배포
              </button>
            )}
            <button onClick={() => setChatOpen(false)} className="text-gray-500 hover:text-gray-200 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {toolStatus && (
          <div className="tool-status-header px-3 py-1 text-[11px] font-mono truncate flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse shrink-0" />
            <span className="truncate">{toolStatus}</span>
          </div>
        )}

        {/* AgentSelector 는 중앙 컬럼으로 이동 — 우측 패널은 채팅 단독 */}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {messages.length === 0 && (
            <div className="py-10 text-center text-[12px] text-gray-500">
              {selected ? "메시지 입력으로 시작" : agents.length === 0 ? "에이전트가 없어요 — 사이드바 [새 에이전트]" : "위에서 에이전트 선택"}
            </div>
          )}
          {messages.map((m: WsMessage, idx: number) => {
            // 핸드오프 시스템 메시지
            if (m.role === "system" && m.handoff) {
              return (
                <div key={m.id} className="w-full">
                  <AgentHandoffCard
                    dispatchId={m.handoff.dispatch_id}
                    steps={m.handoff.steps}
                    onApproved={async () => {
                      notifyPush("success", "핸드오프 승인", "작업이 이어서 진행됩니다", "dispatch");
                      // 각 스텝 running 전환 + 캐릭터 walk 순차 실행
                      const pipeline = usePipelineStore.getState();
                      const handoffStore = useHandoffStore.getState();
                      const steps = m.handoff?.steps || [];
                      for (let i = 0; i < steps.length; i++) {
                        pipeline.setStepStatus(i, "running");
                        await handoffStore.triggerWalk(steps[i].team, "manager");
                        pipeline.setStepStatus(i, "completed", { summary: "전달됨" });
                        await handoffStore.triggerWalk(steps[i].team, "home");
                      }
                    }}
                    onCancelled={() => {
                      notifyPush("info", "핸드오프 취소됨", undefined, "dispatch");
                      usePipelineStore.getState().clear();
                    }}
                  />
                </div>
              );
            }
            // 사용자 메시지 읽음 여부 — 이후에 agent 응답이 있으면 "읽음" 처리
            const isUserMsg = m.role === "user";
            const hasAgentReplyAfter = isUserMsg && messages
              .slice(idx + 1)
              .some((nx) => nx.role === "agent" && (nx.content?.trim().length ?? 0) > 0);
            return (
              <div key={m.id} className={`group flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`relative max-w-[90%] px-3 py-2 rounded-2xl text-[12px] leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-md bg-[var(--chat-user-bg)] border border-[var(--chat-user-border)] text-[var(--chat-user-text)]"
                    : m.role === "system"
                    ? "rounded-bl-md bg-red-950/70 border border-red-500/60 text-red-100"
                    : "rounded-bl-md bg-[var(--chat-ai-bg)] border border-[var(--chat-ai-border)] text-[var(--chat-ai-text)]"
                }`}>
                  {/* 메시지별 복사 버튼 — 유저/에이전트 모두 hover 시 표시.
                   *  코드블록 내부의 복사는 별개 (코드 텍스트만 복사). */}
                  {(m.role === "user" || m.role === "agent") && m.content?.trim() && (
                    <button
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(m.content); }
                        catch {
                          const ta = document.createElement("textarea");
                          ta.value = m.content; ta.style.position = "fixed"; ta.style.opacity = "0";
                          document.body.appendChild(ta); ta.select();
                          try { document.execCommand("copy"); } catch {}
                          document.body.removeChild(ta);
                        }
                      }}
                      title="이 메시지 복사"
                      className={`absolute -top-2 ${m.role === "user" ? "-left-2" : "-right-2"} w-6 h-6 rounded-full border opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-gray-950 border-gray-700 text-gray-300 hover:text-sky-300 hover:border-sky-500/50`}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                  {m.images && m.images.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {m.images.map((src, j) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={j} src={src} alt="" className="max-h-40 rounded border border-gray-700 object-contain" />
                      ))}
                    </div>
                  )}
                  {m.role === "agent" ? (
                    <>
                      <AgentResultCard
                        content={m.content}
                        agentName={m.agentName}
                        agentEmoji={m.agentEmoji}
                        onChooseAnswer={(answer) => wsSendDirect(answer)}
                        onHireAgent={async (proposal) => {
                          // CPO 가 제안한 새 에이전트 채용 — generate-config로 시스템 프롬프트 생성 후 /api/teams/light 등록
                          try {
                            // 1) 시스템 프롬프트 자동 생성 (사용자 직접 만들기 플로우와 동일)
                            const cfgRes = await fetch(`${apiBase()}/api/agents/generate-config`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                name: proposal.name,
                                description: `${proposal.role} — ${proposal.description}`,
                              }),
                            });
                            const cfg = await cfgRes.json().catch(() => ({}));
                            const systemPrompt = (cfg?.ok && cfg.system_prompt) ? cfg.system_prompt : `# ${proposal.name} (${proposal.role})\n\n## 역할\n${proposal.description}\n\n## 채용 사유\n${proposal.reason}`;

                            // 2) 서버 등록
                            const regRes = await fetch(`${apiBase()}/api/teams/light`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                name: proposal.name,
                                emoji: proposal.emoji,
                                description: proposal.description || proposal.role,
                                system_prompt: systemPrompt,
                                collaborative: true,
                              }),
                            });
                            const regData = await regRes.json().catch(() => ({}));
                            if (!regRes.ok || !regData?.ok) {
                              return { ok: false, error: regData?.error || `등록 실패 (${regRes.status})` };
                            }
                            const newId = regData.team?.id || regData.id;
                            if (!newId) return { ok: false, error: "team_id 누락" };

                            // 3) 로컬 store 추가
                            useAgentStore.getState().addAgent({
                              id: newId,
                              name: proposal.name,
                              emoji: proposal.emoji,
                              role: proposal.role,
                              description: proposal.description,
                              systemPromptMd: systemPrompt,
                              workingDirectory: undefined,
                              githubRepo: undefined,
                            });

                            // 4) 즉시 서버 state 동기화 (race 차단)
                            try {
                              const allAgents = useAgentStore.getState().agents;
                              const allFloors = useLayoutStore.getState().floors;
                              await fetch(`${apiBase()}/api/doogeun/state`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ agents: allAgents, layout: { floors: allFloors } }),
                              });
                            } catch { /* 폴백: useStateSync 디바운스 */ }

                            // 5) 폭죽 + 토스트 (UI 자동 선택은 안 함 — CPO 채팅 유지)
                            setCelebrate({ emoji: proposal.emoji, name: proposal.name, phase: "in" });
                            notifyPush("success", `${proposal.emoji} ${proposal.name} 입사`, "CPO 가 채용한 신규 팀원 — 우측 목록에서 바로 채팅 가능", proposal.name);
                            setTimeout(() => {
                              setCelebrate((c) => (c ? { ...c, phase: "out" } : null));
                              setTimeout(() => setCelebrate(null), 320);
                            }, 1600);

                            return { ok: true };
                          } catch (e) {
                            return { ok: false, error: e instanceof Error ? e.message : "채용 실패" };
                          }
                        }}
                      />
                      {m.tools && m.tools.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {m.tools.slice(-6).map((t) => (
                            <div key={t.id} className="tool-pill flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono">
                              {/* 상태 점만 색깔, 텍스트는 항상 중립 고대비 */}
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                t.error ? "bg-red-400" : t.done ? "bg-emerald-400" : "bg-amber-300 animate-pulse"
                              }`} />
                              <span className="truncate">{t.summary}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : m.content ? (
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  ) : null}
                  {/* yes/no 버튼화 — 에이전트 응답 본문에 '[yes / no]' 패턴 감지 시 클릭 가능 버튼.
                   *  hq-ops/MD메이커 등이 '진행할까요? [yes / no]' 보낼 때 사용자 직관 입력. */}
                  {m.role !== "user" && !m.streaming && m.content &&
                   /\[\s*yes\s*\/\s*no\s*\]/i.test(m.content) && (
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => wsSendDirect("yes")}
                        className="h-8 px-3 rounded-md text-[12px] font-bold bg-emerald-500/20 border border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
                        title="yes 자동 전송"
                      >
                        ✓ Yes
                      </button>
                      <button
                        onClick={() => wsSendDirect("no")}
                        className="h-8 px-3 rounded-md text-[12px] font-bold bg-rose-500/20 border border-rose-400/60 text-rose-100 hover:bg-rose-500/30 transition-colors flex items-center gap-1"
                        title="no 자동 전송"
                      >
                        ✗ No
                      </button>
                    </div>
                  )}
                  {/* 시스템 에러 / 재시도 메시지에 [재시도] 버튼 — 마지막 user 메시지 다시 send.
                   *  키워드 확장: 실패/에러/타임아웃/세션/끊김/연결/취소/cancel/timeout/품질미달/응답 없음/오류 */}
                  {/* [재시도] 버튼 — ws_handler 가 명시적으로 보낸 시스템 에러 메시지만.
                   *  user role X / 정상 응답 X / 자연어 '오류/에러/실패' 단어 매칭 X.
                   *  매칭은 백엔드가 보낸 정확한 prefix 만 (자연어 응답 안에 단어 있어도 미매칭). */}
                  {m.role !== "user" && !m.streaming &&
                   (m.retry ||
                    /^\s*⚠️\s*(Claude\s*세션|응답이\s*비어|세션\s*타임아웃)/.test(m.content || "") ||
                    /^\s*❌\s*(오류:|연결\s*끊김|배포\s*실패|협업\s*실패)/m.test(m.content || "") ||
                    /^\s*🚨\s*자동\s*복구\s*실패/.test(m.content || "") ||
                    /\n\s*🛠\s*(자동\s*진단|CPO\s*가\s*처리)/.test(m.content || "") ||
                    /Claude\s*세션\s*깨짐\s*—\s*자동\s*reset/.test(m.content || "")) && (
                    <button
                      onClick={() => {
                        const last = [...messages].reverse().find((x) => x.role === "user" && (x.content?.trim().length ?? 0) > 0);
                        if (last) wsSendDirect(last.content);
                      }}
                      className="mt-1.5 h-7 px-2.5 rounded-md text-[11px] font-bold bg-amber-500/20 border border-amber-400/60 text-amber-100 hover:bg-amber-500/30 transition-colors flex items-center gap-1"
                      title="마지막 메시지 다시 보내기 (Claude 세션 reset 됐으면 즉시 복구)"
                    >
                      <RefreshCw className="w-3 h-3" /> 재시도
                    </button>
                  )}
                </div>
                {/* 사용자 메시지 읽음 표시 */}
                {isUserMsg && (
                  <div className={`text-[10px] mt-0.5 mr-1 ${
                    hasAgentReplyAfter ? "text-sky-400" : wsStreaming ? "text-amber-300" : "text-gray-500"
                  }`}>
                    {hasAgentReplyAfter ? "✓✓ 읽음" : wsStreaming ? "✓ 응답 중…" : "✓ 보냄"}
                  </div>
                )}
              </div>
            );
          })}
          {sending && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-[var(--chat-ai-bg)] border border-[var(--chat-ai-border)]">
                <span className="inline-flex gap-1 items-center text-gray-400 text-[12px]">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* refine 힌트 (모호한 요청일 때) — 라이트/다크 모드 양쪽 가독성 */}
        {refineHints && refineHints.length > 0 && (
          <div className="mx-2 mb-2 p-3 rounded-lg border-2 border-amber-500 bg-amber-100 dark:bg-amber-950/40 dark:border-amber-400/60 text-[12px] space-y-1.5 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="text-amber-900 dark:text-amber-100 font-bold flex items-center gap-1">💡 요청 보완 제안</div>
              <button onClick={forceSend} className="text-[11px] px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold border border-amber-600">
                그대로 전송
              </button>
            </div>
            <ul className="list-disc list-inside text-amber-900 dark:text-amber-50 space-y-1 pl-1">
              {refineHints.map((h, i) => <li key={i} className="leading-relaxed">{h}</li>)}
            </ul>
          </div>
        )}

        {/* 세션 히스토리 */}
        {selected && showSessions && (
          <div className="mx-2 mb-2">
            <SessionHistoryPanel teamId={selected.id} onClose={() => setShowSessions(false)} />
          </div>
        )}

        {/* 파이프라인 진행도 */}
        <div className="mx-2 mb-2 empty:hidden">
          <PipelineDAG />
        </div>

        {/* Deploy 카드 */}
        {showDeploy && selected && (
          <div className="mx-2 mb-2">
            <DeployGuideCard
              teamId={selected.id}
              repo={selected.githubRepo}
              onFixRequest={(errorText, stepKey) => {
                const prompt = buildFixErrorPrompt(errorText, [], `GitHub 배포 단계 "${stepKey}" 에서 실패`);
                wsSendDirect(prompt);
                notifyPush("info", "🔧 AI 수정 요청", "배포 오류를 에이전트에게 전달했습니다", selected.name);
              }}
            />
          </div>
        )}

        {/* 이미지 첨부 프리뷰 */}
        {attachedImages.length > 0 && (
          <div className="flex gap-1.5 px-2 pt-2 flex-wrap">
            {attachedImages.map((src, i) => (
              <div key={i} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-14 rounded border border-gray-700 object-cover" />
                <button
                  onClick={() => setAttachedImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/90 text-white text-[9px] font-bold"
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div
          className="p-2 border-t border-gray-800/60 flex gap-2 shrink-0 items-center"
          onDragOver={(e) => { if (selected) e.preventDefault(); }}
          onDrop={(e) => {
            if (!selected) return;
            e.preventDefault();
            for (const f of Array.from(e.dataTransfer.files)) addImage(f);
          }}
        >
          <label className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md text-gray-500 hover:text-sky-200 hover:bg-gray-800/40 cursor-pointer transition-colors" title="이미지 첨부">
            <Plus className="w-4 h-4" />
            <input type="file" accept="image/*" multiple onChange={(e) => { for (const f of Array.from(e.target.files || [])) addImage(f); e.target.value = ""; }} className="hidden" />
          </label>
          <div className="relative flex-1">
            <textarea
              value={input}
              rows={1}
              onChange={(e) => {
                const v = e.target.value;
                setInput(v);
                // 자동 높이 조정 (최대 ~6줄)
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 140) + "px";
                // @ 패턴 감지 — 마지막 @ 이후 텍스트
                const at = v.lastIndexOf("@");
                if (at >= 0) {
                  const after = v.slice(at + 1);
                  if (!/\s/.test(after)) {
                    setMentionQuery(after);
                    return;
                  }
                }
                setMentionQuery(null);
              }}
              onPaste={(e) => {
                for (const it of Array.from(e.clipboardData.items)) {
                  if (it.kind === "file" && it.type.startsWith("image/")) {
                    const f = it.getAsFile();
                    if (f) addImage(f);
                  }
                }
              }}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDown={(e) => {
                if (composing || e.nativeEvent.isComposing || e.keyCode === 229) return;
                // 멘션 팝업 열려있으면 MentionPopup이 키 처리
                if (mentionQuery !== null && (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab" || e.key === "Escape")) return;
                // Enter: 전송 / Shift+Enter: 줄바꿈 (기본 동작)
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={selected ? "시킬 일 입력 · Enter 전송 · Shift+Enter 줄바꿈 · ⌘+V 이미지 · @에이전트" : "에이전트 선택 필요 — @로 호출"}
              disabled={agents.length === 0}
              className="w-full min-h-9 max-h-36 rounded-md border border-gray-700 bg-gray-900/60 px-3 py-[7px] text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40 disabled:opacity-40 resize-none leading-snug overflow-y-auto"
            />
            {mentionQuery !== null && (
              <MentionPopup
                query={mentionQuery}
                agents={agents}
                onSelect={(a) => {
                  // 입력창의 마지막 @query 를 지우고 에이전트 선택
                  const at = input.lastIndexOf("@");
                  const prefix = at >= 0 ? input.slice(0, at).trimEnd() : input;
                  setInput(prefix ? prefix + " " : "");
                  setMentionQuery(null);
                  setSelectedAgentId(a.id);
                }}
                onClose={() => setMentionQuery(null)}
              />
            )}
          </div>
          <Button onClick={send} disabled={(!input.trim() && attachedImages.length === 0) || !selected || sending} size="sm">
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </aside>

      {/* 채팅 닫혔을 때 열기 핸들 — 데스크탑에서만 */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 h-24 w-6 rounded-l-lg bg-gray-900/90 border-l border-y border-gray-800/80 items-center justify-center text-gray-400 hover:text-gray-200 hover:border-sky-400/30 transition-all z-20"
          title="채팅 펴기"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* 모달들 */}
      <Modal open={modalKey === "agents"} onClose={() => setModalKey(null)} title="에이전트 목록" subtitle={`${agents.length}명 등록`}>
        <AgentsModalBody
          agents={agents}
          onNew={() => setModalKey("newAgent")}
          onSelect={(a) => {
            setSelectedAgentId(a.id);
            setModalKey(null);
            setChatOpen(true);
          }}
          onEdit={(a) => setConfigAgentId(a.id)}
        />
      </Modal>
      <Modal open={modalKey === "newAgent"} onClose={() => setModalKey(null)} title="에이전트 추가" subtitle="빠르게 (AI 초안) / 고도화 프로젝트" widthClass="max-w-2xl">
        <AgentCreate
          onDone={(createdId) => {
            if (createdId) {
              // 새 에이전트 즉시 선택 + 채팅 패널 열기 + 폭죽 + 토스트
              setSelectedAgentId(createdId);
              setChatOpen(true);
              setModalKey(null);
              const a = useAgentStore.getState().agents.find((x) => x.id === createdId);
              if (a) {
                setCelebrate({ emoji: a.emoji, name: a.name, phase: "in" });
                notifyPush("success", `${a.emoji} ${a.name} 생성됨`, "채팅에서 바로 작업 지시 가능", a.name);
                // 1.6초 후 페이드아웃 시작 → 0.3초 후 제거
                setTimeout(() => {
                  setCelebrate((c) => (c ? { ...c, phase: "out" } : null));
                  setTimeout(() => setCelebrate(null), 320);
                }, 1600);
              }
            } else {
              setModalKey("agents");
            }
          }}
        />
      </Modal>

      {/* 에이전트 생성 폭죽 효과 — 중앙 카드 + 사방으로 흩어지는 이모지 */}
      {celebrate && (
        <div className="celebrate-overlay">
          <div className={`celebrate-card ${celebrate.phase === "out" ? "exit" : ""}`}>
            <div className="text-6xl mb-2">{celebrate.emoji}</div>
            <div className="text-[20px] font-bold text-sky-100 leading-tight">
              🎉 {celebrate.name} 입사!
            </div>
            <div className="text-[12px] text-sky-200/80 mt-1">두근컴퍼니에 합류했습니다</div>
          </div>
          {/* 사방으로 흩어지는 이모지 16개 */}
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i / 16) * Math.PI * 2;
            const dist = 180 + (i % 3) * 40;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;
            const rot = (i * 47) % 360;
            const emojis = ["✨", "🎉", "🎊", "⭐", "💫", "🌟", "🎈"];
            return (
              <span
                key={i}
                className="celebrate-burst-emoji"
                style={{
                  ["--bx" as string]: `${dx}px`,
                  ["--by" as string]: `${dy}px`,
                  ["--br" as string]: `${rot}deg`,
                  animationDelay: `${i * 0.025}s`,
                }}
              >
                {emojis[i % emojis.length]}
              </span>
            );
          })}
        </div>
      )}

      <Modal open={modalKey === "server"} onClose={() => setModalKey(null)} title="서버실" subtitle="실시간 상태 (3초 폴링)" widthClass="max-w-3xl">
        <ServerDashboard />
      </Modal>
      <Modal open={modalKey === "bugs"} onClose={() => setModalKey(null)} title="버그 리포트" subtitle="이슈 리스트 / 리포트 작성" widthClass="max-w-2xl">
        <BugsBody />
      </Modal>
      <Modal open={modalKey === "lab"} onClose={() => setModalKey(null)} title="🧪 연구소" subtitle="버그 · 디버그 · 터미널 통합" widthClass="max-w-5xl">
        <LabBody
          onPopoutDebug={() => { setShowDebug(true); }}
          onPopoutTerminal={() => { setShowTerminal(true); }}
        />
      </Modal>
      <Modal open={modalKey === "sites"} onClose={() => setModalKey(null)} title="🌐 외부 사이트" subtitle="에이전트가 만든 사이트 모음 + 도메인 자동 발급" widthClass="max-w-4xl">
        <SitesModal onSelectAgent={(id) => {
          setSelectedAgentId(id);
          setChatOpen(true);
          setModalKey(null);
        }} />
      </Modal>
      <StaffStatsModal open={modalKey === "staff-stats"} onClose={() => setModalKey(null)} />
      <TimelineModal open={modalKey === "timeline"} onClose={() => setModalKey(null)} />

      {showDebug && <DebugPanel onClose={() => setShowDebug(false)} />}
      {showTerminal && (
        <TerminalPanel
          onClose={() => setShowTerminal(false)}
          onFixRequest={(errorLog, command) => {
            if (!selected) return;
            const prompt = buildFixErrorPrompt(errorLog, [], `터미널 명령: ${command}`);
            wsSendDirect(prompt);
            notifyPush("info", "🔧 터미널 에러 전달", command.slice(0, 50), selected.name);
            setShowTerminal(false);
          }}
        />
      )}
      {configAgent && <AgentConfigModal agent={configAgent} onClose={() => setConfigAgentId(null)} />}
      {activityAgentId && (() => {
        const ag = agents.find((a) => a.id === activityAgentId);
        if (!ag) return null;
        return <AgentActivityModal agent={ag} onClose={() => setActivityAgentId(null)} />;
      })()}
      {ctxMenu && (() => {
        const ag = agents.find((a) => a.id === ctxMenu.agentId);
        if (!ag) return null;
        return (
          <AgentContextMenu
            agent={ag}
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
            onOpenConfig={() => { setCtxMenu(null); setConfigAgentId(ag.id); }}
            onOpenChat={() => { setCtxMenu(null); setSelectedAgentId(ag.id); setChatOpen(true); }}
            onOpenActivity={() => { setCtxMenu(null); setActivityAgentId(ag.id); }}
            onDelete={async () => {
              setCtxMenu(null);
              const ok = await askConfirm({
                title: "에이전트 완전 삭제",
                message: `"${ag.name}" 를 서버에서도 삭제합니다. 복구 불가.`,
                confirmText: "삭제",
                destructive: true,
              });
              if (!ok) return;
              const { deleteTeamOnServer } = await import("@/lib/importTeams");
              await deleteTeamOnServer(ag.id, false);
              removeAgentFn(ag.id);
            }}
          />
        );
      })()}
    </div>
  );
}





