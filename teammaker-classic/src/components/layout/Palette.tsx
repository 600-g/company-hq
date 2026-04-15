"use client";

import { useTranslations } from "next-intl";
import { useUIStore } from "@/stores/uiStore";
import { useAgentStore } from "@/stores/agentStore";
import { useOfficeStore } from "@/stores/officeStore";
import { agentOccKey } from "@/lib/grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Monitor, X } from "lucide-react";
import AgentAvatar from "@/components/agent/AgentAvatar";
import type { DeskStatus } from "@/types/agent";

const STATUS_COLORS: Record<DeskStatus, string> = {
  idle: "bg-gray-400",
  working: "bg-yellow-400 animate-pulse",
  complete: "bg-green-500",
  error: "bg-red-500",
};

export default function Palette() {
  const t = useTranslations("palette");
  const ts = useTranslations("status");
  const { isPaletteCollapsed, togglePalette, openDetailPanel } = useUIStore();

  const STATUS_LABELS: Record<DeskStatus, string> = {
    idle: ts("idle"),
    working: ts("working"),
    complete: ts("complete"),
    error: ts("error"),
  };
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const removeAgent = useAgentStore((s) => s.removeAgent);
  const freeCell = useOfficeStore((s) => s.freeCell);

  const agentList = Array.from(agents.values());

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", "new-desk");
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleAgentClick = (agentId: string) => {
    selectAgent(agentId);
    openDetailPanel();
  };

  const handleDeleteAgent = (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    const agent = agents.get(agentId);
    if (!agent) return;
    if (!window.confirm(t("deleteConfirm", { name: agent.name }))) return;
    const occ = agentOccKey(agent.position.x, agent.position.y);
    freeCell(occ.gx, occ.gy);
    removeAgent(agentId);
    if (selectedAgentId === agentId) selectAgent(null);
  };

  return (
    <aside
      className={`border-r bg-background transition-[width] duration-300 flex flex-col flex-shrink-0 ${
        isPaletteCollapsed ? "w-[60px]" : "w-[200px]"
      }`}
    >
      <div className="flex items-center justify-end p-2">
        <Button variant="ghost" size="icon" onClick={togglePalette} className="h-7 w-7">
          {isPaletteCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        <Card
          draggable
          onDragStart={handleDragStart}
          className={`cursor-grab active:cursor-grabbing border-dashed border-2 hover:border-primary transition-colors ${
            isPaletteCollapsed ? "p-2" : "p-3"
          }`}
        >
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            {!isPaletteCollapsed && (
              <div>
                <p className="text-sm font-medium">{t("newAgent")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("dragToPlace")}
                </p>
              </div>
            )}
          </div>
        </Card>

        {agentList.length > 0 && (
          <>
            {!isPaletteCollapsed && (
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2">
                {t("agentCount", { count: agentList.length })}
              </p>
            )}
            {isPaletteCollapsed && agentList.length > 0 && (
              <div className="flex justify-center pt-1">
                <span className="text-[10px] text-muted-foreground">{agentList.length}</span>
              </div>
            )}
            {agentList.map((agent, idx) => (
                <div
                  key={agent.id}
                  onClick={() => handleAgentClick(agent.id)}
                  className={`w-full rounded-md border transition-colors text-left cursor-pointer ${
                    isPaletteCollapsed ? "p-2" : "p-2.5"
                  } ${
                    selectedAgentId === agent.id
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="relative flex-shrink-0">
                      <AgentAvatar agentIndex={idx} size={28} />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${STATUS_COLORS[agent.status]}`}
                        title={STATUS_LABELS[agent.status]}
                      />
                    </div>
                    {!isPaletteCollapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{agent.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {agent.role}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteAgent(e, agent.id)}
                          className="flex-shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete agent"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
            ))}
          </>
        )}
      </div>

      {!isPaletteCollapsed && (
        <div className="p-3 border-t">
          <p className="text-xs text-muted-foreground text-center">
            {agentList.length > 0
              ? t("clickForDetail")
              : t("dragToCanvas")}
          </p>
        </div>
      )}
    </aside>
  );
}
