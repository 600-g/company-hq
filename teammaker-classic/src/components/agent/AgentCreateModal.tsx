"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { generateAgentConfig } from "@/lib/claude";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface AgentCreateModalProps {
  onConfigGenerated: (
    name: string,
    description: string,
    role: string,
    outputHint: string | undefined,
    steps: string[] | undefined,
    position: { x: number; y: number }
  ) => void;
}

export default function AgentCreateModal({
  onConfigGenerated,
}: AgentCreateModalProps) {
  const t = useTranslations("agentCreate");
  const { isAgentCreateOpen, closeAgentCreate, pendingAgentPosition } =
    useUIStore();
  const isApiKeyValid = useSettingsStore((s) => s.isApiKeyValid);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !isApiKeyValid || !pendingAgentPosition)
      return;

    setIsLoading(true);
    setError(null);

    try {
      const config = await generateAgentConfig(name, description);
      onConfigGenerated(name, description, config.role, config.outputHint, config.steps, pendingAgentPosition);
      setName("");
      setDescription("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("configFailed")
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    closeAgentCreate();
    setName("");
    setDescription("");
    setError(null);
  };

  return (
    <Dialog open={isAgentCreateOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">{t("nameLabel")}</Label>
              <Input
                id="agent-name"
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-desc">{t("descLabel")}</Label>
              <Textarea
                id="agent-desc"
                placeholder={t("descPlaceholder")}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                {t("example")}
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={!name.trim() || !description.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("generating")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
