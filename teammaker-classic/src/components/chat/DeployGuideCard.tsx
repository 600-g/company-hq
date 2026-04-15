"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/stores/settingsStore";
import { useChatStore } from "@/stores/chatStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Database,
  Github,
  Globe,
  ExternalLink,
  Check,
  Loader2,
  Rocket,
} from "lucide-react";

type DeployStep = "db" | "github" | "tokens" | "ready";

interface DeployChoice {
  needsDb: boolean;
  needsGithub: boolean;
}

interface Props {
  onDeploy: (choice: DeployChoice) => void;
  storageType?: string;
  githubRepo?: string;
}

const DEPLOY_STEPS = [
  { labelKey: "stepProjectReady", delay: 0 },
  { labelKey: "stepUploadVercel", delay: 5000 },
  { labelKey: "stepBuildDeploy", delay: 15000 },
];

function DeployProgress() {
  const t = useTranslations("deploy");
  const [activeStep, setActiveStep] = useState(0);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const messages = useChatStore((s) => s.messages);

  useEffect(() => {
    const timers = DEPLOY_STEPS.map((step, i) => {
      if (i === 0) return null;
      return setTimeout(() => setActiveStep(i), step.delay);
    });
    return () => timers.forEach((timer) => timer && clearTimeout(timer));
  }, []);

  useEffect(() => {
    const lastDeploy = [...messages].reverse().find(
      (m) => m.taskId === "deploy-complete" || m.taskId === "deploy-failed",
    );
    if (!lastDeploy) return;
    if (lastDeploy.taskId === "deploy-failed") {
      setFailed(true);
    } else {
      setDone(true);
    }
    setActiveStep(DEPLOY_STEPS.length);
  }, [messages]);

  const statusIcon = done
    ? <Check className="h-4 w-4 text-green-500" />
    : failed
    ? <span className="h-4 w-4 text-red-500">✗</span>
    : <Loader2 className="h-4 w-4 animate-spin text-primary" />;

  const statusText = done ? t("deployDone") : failed ? t("deployFailed") : t("deploying");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        {statusIcon}
        <p className="text-sm font-medium">{statusText}</p>
      </div>
      {DEPLOY_STEPS.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          {i < activeStep ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : i === activeStep && !done ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          ) : (
            <div className="h-3.5 w-3.5 rounded-full border" />
          )}
          <span className={`text-xs ${i > activeStep ? "text-muted-foreground" : ""}`}>
            {t(step.labelKey as Parameters<typeof t>[0])}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DeployGuideCard({ onDeploy, storageType, githubRepo }: Props) {
  const t = useTranslations("deploy");
  const tCommon = useTranslations("common");
  const { tokens, saveToken } = useSettingsStore();
  const needsDbFromPipeline = storageType === "database";
  const hasGithub = !!githubRepo;
  // If storageType is set skip db, if githubRepo is set skip github too → go straight to tokens
  const initialStep: DeployStep = hasGithub ? "tokens" : storageType ? "github" : "db";
  const [step, setStep] = useState<DeployStep>(initialStep);
  const [choice, setChoice] = useState<DeployChoice>({ needsDb: needsDbFromPipeline, needsGithub: hasGithub });
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [savedTokens, setSavedTokens] = useState<Record<string, boolean>>({});

  const TOKEN_GUIDES = useMemo(() => [
    {
      key: "VERCEL_TOKEN" as const,
      label: "Vercel",
      icon: Globe,
      descKey: "vercelDesc",
      stepKeys: ["vercelStep1", "vercelStep2", "vercelStep3", "vercelStep4"],
      guideUrl: "https://vercel.com/account/tokens",
      always: true,
    },
    {
      key: "SUPABASE_ACCESS_TOKEN" as const,
      label: "Supabase",
      icon: Database,
      descKey: "supabaseDesc",
      stepKeys: ["supabaseStep1", "supabaseStep2", "supabaseStep3", "supabaseStep4"],
      guideUrl: "https://supabase.com/dashboard/account/tokens",
      always: false,
      condition: "needsDb" as const,
    },
    {
      key: "GITHUB_TOKEN" as const,
      label: "GitHub",
      icon: Github,
      descKey: "githubDesc",
      stepKeys: ["githubStep1", "githubStep2", "githubStep3", "githubStep4", "githubStep5"],
      guideUrl: "https://github.com/settings/tokens/new",
      always: false,
      condition: "needsGithub" as const,
    },
  ], []);

  const getRequiredTokens = () => {
    return TOKEN_GUIDES.filter(
      (guide) => guide.always || (guide.condition && choice[guide.condition])
    );
  };

  const isTokenReady = (key: string) => {
    return tokens[key as keyof typeof tokens] || savedTokens[key];
  };

  const allTokensReady = () => {
    return getRequiredTokens().every((guide) => isTokenReady(guide.key));
  };

  const handleSaveToken = async (key: "VERCEL_TOKEN" | "SUPABASE_ACCESS_TOKEN" | "GITHUB_TOKEN", value: string) => {
    if (!value.trim()) return;
    const success = await saveToken(key, value.trim());
    if (success) {
      setSavedTokens((prev) => ({ ...prev, [key]: true }));
      setTokenInputs((prev) => ({ ...prev, [key]: "" }));
    }
  };

  return (
    <div className="w-[90%] rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary/5">
        <Rocket className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{t("guideTitle")}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Step 1: DB needed? */}
        {step === "db" && (
          <div className="space-y-3">
            <p className="text-sm">
              {t.rich("dbQuestion", { bold: (chunks) => <strong>{chunks}</strong> })}
            </p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <strong>{t("noStorage")}</strong> — {t("noStorageDesc")}
              </p>
              <p>
                <strong>{t("needStorage")}</strong> — {t("needStorageDesc")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setChoice((c) => ({ ...c, needsDb: false }));
                  setStep("github");
                }}
              >
                {t("noStorage")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setChoice((c) => ({ ...c, needsDb: true }));
                  setStep("github");
                }}
              >
                <Database className="h-3.5 w-3.5 mr-1" />
                {t("needStorage")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: GitHub needed? */}
        {step === "github" && (
          <div className="space-y-3">
            <p className="text-sm">
              {t.rich("githubQuestion", { bold: (chunks) => <strong>{chunks}</strong> })}
            </p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>{t("githubBenefit")}</p>
              <p>{t("githubSkipNote")}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setChoice((c) => ({ ...c, needsGithub: false }));
                  setStep("tokens");
                }}
              >
                {t("deployOnly")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setChoice((c) => ({ ...c, needsGithub: true }));
                  setStep("tokens");
                }}
              >
                <Github className="h-3.5 w-3.5 mr-1" />
                {t("uploadToGithub")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Enter tokens */}
        {step === "tokens" && (
          <div className="space-y-4">
            <p className="text-sm">{t("enterTokens")}</p>
            <div className="flex gap-1.5 mb-2">
              {getRequiredTokens().map((guide) => {
                const ready = isTokenReady(guide.key);
                return (
                  <Badge
                    key={guide.key}
                    variant={ready ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {ready && <Check className="h-2.5 w-2.5 mr-0.5" />}
                    {guide.label}
                  </Badge>
                );
              })}
            </div>

            {getRequiredTokens().map((guide) => {
              const ready = isTokenReady(guide.key);
              const Icon = guide.icon;
              return (
                <div
                  key={guide.key}
                  className={`rounded-lg border p-3 space-y-2 ${ready ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{guide.label}</span>
                    {ready && (
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        <Check className="h-2.5 w-2.5 mr-0.5" />
                        {tCommon("done")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(guide.descKey as Parameters<typeof t>[0])}
                  </p>

                  {!ready && (
                    <>
                      <div className="space-y-1 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                        {guide.stepKeys.map((stepKey, i) => (
                          <p key={i} className="flex gap-1.5">
                            <span className="text-primary font-medium">{i + 1}.</span>
                            {t(stepKey as Parameters<typeof t>[0])}
                          </p>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs gap-1"
                        onClick={() => window.open(guide.guideUrl, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t("openTokenPage")}
                      </Button>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder={t("pasteToken")}
                          value={tokenInputs[guide.key] || ""}
                          onChange={(e) =>
                            setTokenInputs((prev) => ({ ...prev, [guide.key]: e.target.value }))
                          }
                          className="text-xs h-8"
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={!tokenInputs[guide.key]?.trim()}
                          onClick={() => handleSaveToken(guide.key, tokenInputs[guide.key])}
                        >
                          {tCommon("save")}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {allTokensReady() && (
              <Button
                className="w-full gap-2"
                onClick={() => {
                  setStep("ready");
                  onDeploy(choice);
                }}
              >
                <Rocket className="h-4 w-4" />
                {t("startDeploy")}
              </Button>
            )}
          </div>
        )}

        {/* Step 4: Deploying */}
        {step === "ready" && <DeployProgress />}
      </div>
    </div>
  );
}
