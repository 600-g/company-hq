"use client";

import { useTranslations } from "next-intl";
import { useUIStore } from "@/stores/uiStore";
import { useAgentStore } from "@/stores/agentStore";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const statusConfig = {
  idle: { labelKey: "idle", variant: "secondary" as const },
  working: { labelKey: "working", variant: "default" as const },
  complete: { labelKey: "complete", variant: "outline" as const },
  error: { labelKey: "error", variant: "destructive" as const },
};

export default function AgentDetailPanel() {
  const t = useTranslations("agentDetail");
  const ts = useTranslations("status");
  const { isDetailPanelOpen, closeDetailPanel } = useUIStore();
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const agents = useAgentStore((s) => s.agents);
  const agent = selectedAgentId ? agents.get(selectedAgentId) : null;

  if (!agent) return null;

  const status = statusConfig[agent.status];

  return (
    <Sheet open={isDetailPanelOpen} onOpenChange={closeDetailPanel}>
      <SheetContent side="right" className="w-[360px] p-0">
        <SheetHeader className="p-4 pt-10 pb-0">
          <div className="flex items-center justify-between">
            <SheetTitle>{agent.name}</SheetTitle>
            <Badge variant={status.variant}>{ts(status.labelKey)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{agent.description}</p>
        </SheetHeader>

        <Separator className="my-3" />

        <div className="px-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("role")}</h3>
            <p className="text-sm">{agent.role}</p>
          </div>

          {agent.outputHint && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("output")}</h3>
              <p className="text-sm text-muted-foreground">{agent.outputHint}</p>
            </div>
          )}

          {agent.status === "working" && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("currentTask")}</h3>
              <div className="flex items-center gap-3 rounded-md border p-3">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{agent.role}</p>
                  <p className="text-xs text-muted-foreground">
                    {ts("working")}{agent.currentTask && ` - ${agent.currentTask}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {agent.status === "idle" && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("noTask")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
