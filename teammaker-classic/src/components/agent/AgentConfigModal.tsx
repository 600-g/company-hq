"use client";

import { useTranslations } from "next-intl";
import { useUIStore } from "@/stores/uiStore";
import { useAgentStore } from "@/stores/agentStore";
import { useOfficeStore } from "@/stores/officeStore";
import { agentOccKey } from "@/lib/grid";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AgentConfigModalProps {
  agentName: string;
  agentDescription: string;
  role: string;
  outputHint?: string;
  steps?: string[];
  position: { x: number; y: number };
  onConfirm: () => void;
}

export default function AgentConfigModal({
  agentName,
  agentDescription,
  role,
  outputHint,
  steps,
  position,
  onConfirm,
}: AgentConfigModalProps) {
  const t = useTranslations("agentConfig");
  const { isAgentConfigOpen, closeAgentConfig } = useUIStore();
  const addAgent = useAgentStore((s) => s.addAgent);
  const occupyCell = useOfficeStore((s) => s.occupyCell);

  const handleConfirm = () => {
    const agentId = crypto.randomUUID();
    addAgent({
      id: agentId,
      name: agentName,
      description: agentDescription,
      role,
      outputHint,
      status: "idle",
      position,
    });
    const occ = agentOccKey(position.x, position.y);
    occupyCell(occ.gx, occ.gy, agentId);
    closeAgentConfig();
    onConfirm();
  };

  return (
    <Dialog open={isAgentConfigOpen} onOpenChange={closeAgentConfig}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="secondary">🎯</Badge>
              {t("title", { name: agentName })}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {t("description")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="font-medium text-sm">{role}</p>
            <p className="text-sm text-muted-foreground">
              {agentDescription}
            </p>
            {steps && steps.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("steps")}</p>
                <ol className="space-y-1">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {outputHint && (
              <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">{t("output")}</span>
                {outputHint}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="pt-2">
          <Button variant="default" className="w-full" onClick={handleConfirm}>
            {t("confirmButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
