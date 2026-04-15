"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/stores/settingsStore";
import { useBillingStore, FREE_SESSION_LIMIT } from "@/stores/billingStore";
import { useAgentStore } from "@/stores/agentStore";
import { useOfficeStore } from "@/stores/officeStore";
import { agentOccKey } from "@/lib/grid";
import { useChatStore } from "@/stores/chatStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, Check, Trash2, Zap, Brain, Sparkles, Globe, CircleAlert, Lock, Unlock } from "lucide-react";
import { useLocale } from "next-intl";
import { type Locale } from "@/i18n/config";
import { HAIKU_MODEL, SONNET_MODEL, OPUS_MODEL } from "@/lib/models";
import { TEAMMAKER_PRO_CHECKOUT_URL } from "@/lib/billing";


export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const {
    maskedKey,
    clearApiKey,
    loadSettings,
    testMode,
    setTestMode,
    selectedModel,
    setSelectedModel,
    tokens,
    saveToken,
    deleteToken,
  } = useSettingsStore();

  const MODEL_OPTIONS = useMemo(() => [
    {
      id: HAIKU_MODEL,
      name: "Haiku",
      description: t("modelHaikuDesc"),
      detail: t("modelHaikuDetail"),
      cost: t("modelHaikuCost"),
      costLabel: t("modelHaikuLabel"),
      icon: Zap,
    },
    {
      id: SONNET_MODEL,
      name: "Sonnet",
      description: t("modelSonnetDesc"),
      detail: t("modelSonnetDetail"),
      cost: t("modelSonnetCost"),
      costLabel: t("modelSonnetLabel"),
      icon: Sparkles,
    },
    {
      id: OPUS_MODEL,
      name: "Opus",
      description: t("modelOpusDesc"),
      detail: t("modelOpusDetail"),
      cost: t("modelOpusCost"),
      costLabel: t("modelOpusLabel"),
      icon: Brain,
    },
  ], [t]);

  const TOKEN_CONFIG = useMemo(() => [
    {
      key: "VERCEL_TOKEN" as const,
      label: "Vercel",
      description: t("vercelTokenDesc"),
      link: "https://vercel.com/account/tokens",
      pattern: /^(vercel_|vcp_)/,
      hint: t("vercelTokenHint"),
    },
    {
      key: "SUPABASE_ACCESS_TOKEN" as const,
      label: "Supabase",
      description: t("supabaseTokenDesc"),
      link: "https://supabase.com/dashboard/account/tokens",
      pattern: /^sbp_/,
      hint: t("supabaseTokenHint"),
    },
    {
      key: "GITHUB_TOKEN" as const,
      label: "GitHub",
      description: t("githubTokenDesc"),
      link: "https://github.com/settings/tokens/new",
      pattern: /^(ghp_|github_pat_)/,
      hint: t("githubTokenHint"),
    },
  ], [t]);
  const freeCell = useOfficeStore((s) => s.freeCell);
  const agents = useAgentStore((s) => s.agents);
  const removeAgent = useAgentStore((s) => s.removeAgent);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const billingStatus = useBillingStore((s) => s.status);
  const licenseKey = useBillingStore((s) => s.licenseKey);
  const saveLicenseKey = useBillingStore((s) => s.saveLicenseKey);
  const saveInstanceId = useBillingStore((s) => s.saveInstanceId);
  const getOrCreateDeviceId = useBillingStore((s) => s.getOrCreateDeviceId);
  const markCheckoutStarted = useBillingStore((s) => s.markCheckoutStarted);
  const activateLocally = useBillingStore((s) => s.activateLocally);
  const resetBillingState = useBillingStore((s) => s.resetBillingState);

  const currentLocale = useLocale();
  const [isTester, setIsTester] = useState(false);
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [tokenSaving, setTokenSaving] = useState<Record<string, boolean>>({});
  const [tokenErrors, setTokenErrors] = useState<Record<string, string | null>>({});
  const [licenseInput, setLicenseInput] = useState("");
  const [licenseValidating, setLicenseValidating] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    setIsTester(localStorage.getItem("TESTER") === "true");
  }, [loadSettings]);

  useEffect(() => {
    setLicenseInput(licenseKey);
  }, [licenseKey]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/office")}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToOffice")}
        </Button>

        <h1 className="text-2xl font-bold">{t("title")}</h1>

        <Card>
          <CardHeader>
            <CardTitle>{t("apiKeyTitle")}</CardTitle>
            <CardDescription>{t("apiKeyDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={maskedKey || tc("notConfigured")} disabled />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  clearApiKey();
                  router.push("/setup");
                }}
              >
                {tc("change")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("languageTitle")}</CardTitle>
            <CardDescription>{t("languageDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(["ko", "en"] as Locale[]).map((loc) => {
              const isSelected = currentLocale === loc;
              const label = loc === "ko" ? t("languageKo") : t("languageEn");
              return (
                <button
                  key={loc}
                  onClick={() => {
                    document.cookie = `locale=${loc};path=/;max-age=${60 * 60 * 24 * 365}`;
                    window.location.reload();
                  }}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Globe className={`h-5 w-5 flex-shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("modelTitle")}</CardTitle>
            <CardDescription>{t("modelDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {MODEL_OPTIONS.map(({ id, name, description, detail, cost, costLabel, icon: Icon }) => {
              const isSelected = selectedModel === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedModel(id)}
                  className={`w-full flex items-center gap-4 rounded-lg border p-4 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Icon className={`h-6 w-6 flex-shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{description}</span>
                      <Badge variant="secondary" className="text-[10px]">{costLabel}</Badge>
                      {isSelected && <Check className="h-4 w-4 text-primary ml-auto flex-shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{detail}</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">{name} · {cost}</p>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("tokensTitle")}</CardTitle>
            <CardDescription>
              {t("tokensDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {TOKEN_CONFIG.map(({ key, label, description, link, pattern, hint }) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  {tokens[key] && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" />
                      {tc("configured")}
                    </Badge>
                  )}
                </div>
                {tokens[key] ? (
                  <div className="flex gap-2">
                    <Input value="●●●●●●●●●●●●" disabled className="flex-1" />
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Delete ${label} token`}
                      onClick={() => {
                        if (!confirm(t("tokenDeleteConfirm", { label }))) return;
                        deleteToken(key);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder={t("tokenPlaceholder", { label })}
                        value={tokenInputs[key] || ""}
                        onChange={(e) => {
                          setTokenInputs((prev) => ({ ...prev, [key]: e.target.value }));
                          setTokenErrors((prev) => ({ ...prev, [key]: null }));
                        }}
                        className="flex-1"
                      />
                      <Button
                        disabled={!tokenInputs[key]?.trim() || tokenSaving[key]}
                        onClick={async () => {
                          const val = tokenInputs[key].trim();
                          if (pattern && !pattern.test(val)) {
                            setTokenErrors((prev) => ({ ...prev, [key]: hint || t("tokenInvalid") }));
                            return;
                          }
                          setTokenSaving((prev) => ({ ...prev, [key]: true }));
                          setTokenErrors((prev) => ({ ...prev, [key]: null }));
                          try {
                            const success = await saveToken(key, val);
                            if (success) {
                              setTokenInputs((prev) => ({ ...prev, [key]: "" }));
                            } else {
                              setTokenErrors((prev) => ({ ...prev, [key]: t("tokenSaveFailed") }));
                            }
                          } catch {
                            setTokenErrors((prev) => ({ ...prev, [key]: t("tokenSaveFailed") }));
                          } finally {
                            setTokenSaving((prev) => ({ ...prev, [key]: false }));
                          }
                        }}
                      >
                        {tokenSaving[key] ? tc("saving") : tc("save")}
                      </Button>
                    </div>
                    {tokenErrors[key] && (
                      <p className="text-xs text-destructive">{tokenErrors[key]}</p>
                    )}
                  </>
                )}
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("tokenPage")}
                </a>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* TODO: beta 이후 결제 연동 시 세션 제한 카드 복원
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {billingStatus === "active" ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
              {t("sessionLimitTitle")}
            </CardTitle>
            <CardDescription>
              {billingStatus === "active"
                ? t("sessionLimitUnlocked")
                : t("sessionLimitDesc", { current: FREE_SESSION_LIMIT })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {billingStatus !== "active" && (
              <>
                <Button
                  className="w-full"
                  disabled={!TEAMMAKER_PRO_CHECKOUT_URL}
                  onClick={() => {
                    markCheckoutStarted();
                    if (TEAMMAKER_PRO_CHECKOUT_URL) {
                      window.open(TEAMMAKER_PRO_CHECKOUT_URL, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("unlockSessions")}
                </Button>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("licenseKeyTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("licenseKeyDesc")}</p>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder={t("licenseKeyPlaceholder")}
                      value={licenseInput}
                      onChange={(e) => {
                        setLicenseInput(e.target.value);
                        setBillingMessage(null);
                      }}
                    />
                    <Button
                      variant="outline"
                      disabled={!licenseInput.trim() || licenseValidating}
                      onClick={async () => {
                        const key = licenseInput.trim();
                        if (!key) return;
                        setLicenseValidating(true);
                        setBillingMessage(null);
                        try {
                          const deviceId = getOrCreateDeviceId();
                          const res = await fetch("/api/billing/validate-license", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ licenseKey: key, instanceName: deviceId }),
                          });
                          const data = await res.json();
                          if (data.valid) {
                            saveLicenseKey(key);
                            if (data.instanceId) saveInstanceId(data.instanceId);
                            activateLocally();
                            setBillingMessage(t("licenseActivated"));
                          } else {
                            setBillingMessage(t("licenseInvalid"));
                          }
                        } catch {
                          setBillingMessage(t("licenseError"));
                        } finally {
                          setLicenseValidating(false);
                        }
                      }}
                    >
                      {licenseValidating ? tc("saving") : t("licenseActivate")}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {isTester && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    activateLocally();
                    setBillingMessage(t("proTesterUnlocked"));
                  }}
                >
                  {t("proTesterUnlock")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetBillingState();
                    setBillingMessage(t("proResetDone"));
                  }}
                >
                  {t("proReset")}
                </Button>
              </div>
            )}

            {billingMessage && <p className="text-xs text-muted-foreground">{billingMessage}</p>}
          </CardContent>
        </Card>
        */}

        {isTester && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("testModeTitle")}
                {testMode && <Badge variant="secondary">ON</Badge>}
              </CardTitle>
              <CardDescription>
                {t("testModeDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant={testMode ? "default" : "outline"}
                onClick={() => setTestMode(!testMode)}
              >
                {testMode ? t("testModeOff") : t("testModeOn")}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("dataTitle")}</CardTitle>
            <CardDescription>{t("dataDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => {
                if (!confirm(t("dataConfirm"))) return;
                agents.forEach((agent, agentId) => {
                  const occ = agentOccKey(agent.position.x, agent.position.y);
                  freeCell(occ.gx, occ.gy);
                  removeAgent(agentId);
                });
                clearMessages();
              }}
            >
              {t("resetOffice")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
