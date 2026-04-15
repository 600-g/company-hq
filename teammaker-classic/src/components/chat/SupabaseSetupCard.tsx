"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/stores/settingsStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Database,
  ExternalLink,
  Check,
  Loader2,
} from "lucide-react";

interface Props {
  projectName: string;
  onComplete: (config: { supabaseUrl: string; anonKey: string; serviceRoleKey: string; projectId: string }) => void;
  onSkip: () => void;
}

export default function SupabaseSetupCard({ projectName, onComplete, onSkip }: Props) {
  const t = useTranslations("supabaseSetup");
  const tCommon = useTranslations("common");
  const { tokens, saveToken } = useSettingsStore();
  const [tokenInput, setTokenInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDashboardLink, setShowDashboardLink] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasToken = tokens.SUPABASE_ACCESS_TOKEN || saved;

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    const success = await saveToken("SUPABASE_ACCESS_TOKEN", tokenInput.trim());
    if (success) {
      setSaved(true);
      setTokenInput("");
    } else {
      setError(t("tokenSaveFailed"));
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/deploy/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const isLimitError = data.error?.includes("limit") || res.status === 402;
        setError(isLimitError ? t("limitError") : data.error || t("createFailed"));
        setShowDashboardLink(isLimitError);
        return;
      }

      onComplete({
        supabaseUrl: data.projectUrl,
        anonKey: data.anonKey,
        serviceRoleKey: data.serviceRoleKey,
        projectId: data.projectId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-[90%] rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary/5">
        <Database className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{t("title")}</span>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm">
          {t.rich("description", { bold: (chunks) => <strong>{chunks}</strong> })}
        </p>

        {!hasToken ? (
          <div className="space-y-3">
            <div className="space-y-1 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <p className="flex gap-1.5"><span className="text-primary font-medium">1.</span> {t("step1")}</p>
              <p className="flex gap-1.5"><span className="text-primary font-medium">2.</span> {t("step2")}</p>
              <p className="flex gap-1.5"><span className="text-primary font-medium">3.</span> {t("step3")}</p>
              <p className="flex gap-1.5"><span className="text-primary font-medium">4.</span> {t("step4")}</p>
            </div>
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0 text-xs gap-1"
              onClick={() => window.open("https://supabase.com/dashboard/account/tokens", "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3 w-3" />
              {t("openTokenPage")}
            </Button>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={t("tokenPlaceholder")}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="text-xs h-8"
              />
              <Button
                size="sm"
                className="h-8"
                disabled={!tokenInput.trim()}
                onClick={handleSaveToken}
              >
                {tCommon("save")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                <Check className="h-2.5 w-2.5 mr-0.5" />
                {t("tokenReady")}
              </Badge>
            </div>

            {error && (
              <div className="space-y-2">
                <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>
                {showDashboardLink && (
                  <Button
                    size="sm"
                    variant="link"
                    className="h-auto p-0 text-xs gap-1"
                    onClick={() => window.open("https://supabase.com/dashboard/projects", "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t("deleteDashboard")}
                  </Button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    {t("creating")}
                  </>
                ) : (
                  <>
                    <Database className="h-3.5 w-3.5 mr-1" />
                    {t("createDb")}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={onSkip}
              >
                {tCommon("skip")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
