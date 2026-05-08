"use client";

import { Badge } from "@/components/ui/badge";
import { useAgentStore } from "@/stores/agentStore";
import { useChatStore } from "@/stores/chatStore";

interface WorkingAgentsStripProps {
  collapsed: boolean;
  onSelect: (id: string) => void;
}

export function WorkingAgentsStrip({ collapsed, onSelect }: WorkingAgentsStripProps) {
  const streamingByTeam = useChatStore((s) => s.streamingByTeam);
  const unreadByTeam = useChatStore((s) => s.unreadByTeam);
  const agents = useAgentStore((s) => s.agents);
  const workingIds = Object.entries(streamingByTeam).filter(([, v]) => v).map(([k]) => k);
  const unreadIds = Object.entries(unreadByTeam).filter(([, v]) => v > 0).map(([k]) => k);
  const activeIds = Array.from(new Set([...workingIds, ...unreadIds]));
  if (activeIds.length === 0) return null;
  if (collapsed) {
    return (
      <div className="flex flex-col gap-1 items-center py-1">
        {activeIds.slice(0, 4).map((id) => {
          const a = agents.find((x) => x.id === id);
          if (!a) return null;
          const working = streamingByTeam[id];
          return (
            <button key={id} onClick={() => onSelect(id)} title={`${a.name} · ${working ? "작업중" : "완료 알림"}`} className="relative">
              <span className="text-base">{a.emoji}</span>
              {working && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />}
              {!working && (unreadByTeam[id] ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="mt-1 rounded-md bg-amber-500/5 border border-amber-400/20 p-1.5 space-y-0.5">
      <div className="text-[9px] text-amber-300 uppercase font-bold px-1">🔥 활동 중</div>
      {activeIds.map((id) => {
        const a = agents.find((x) => x.id === id);
        if (!a) return null;
        const working = streamingByTeam[id];
        const unread = unreadByTeam[id] ?? 0;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] hover:bg-gray-900/50 text-gray-300"
          >
            <span>{a.emoji}</span>
            <span className="flex-1 truncate text-left">{a.name}</span>
            {working ? (
              <span className="flex items-center gap-0.5 text-amber-300">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                <span className="text-[9px]">작업중</span>
              </span>
            ) : (
              <span className="text-[9px] px-1 rounded-full bg-red-500/80 text-white font-bold">{unread}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface SideItemProps {
  collapsed: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  badge?: number;
  active?: boolean;
}

export function SideItem({ collapsed, icon: Icon, label, onClick, badge, active }: SideItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[14px] transition-colors ${
        active
          ? "bg-sky-500/10 text-gray-200"
          : "text-gray-300 hover:bg-gray-800/50 hover:text-gray-200"
      }`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          {badge != null && badge > 0 && <Badge variant="secondary">{badge}</Badge>}
        </>
      )}
    </button>
  );
}
