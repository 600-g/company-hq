"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";

export default function SetupPage() {
  const t = useTranslations("setup");
  const router = useRouter();
  const { setApiKey } = useSettingsStore();
  const [key, setKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError(t("emptyKey"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Save key to server first
      await setApiKey(key.trim());

      // Validate by making a test call through our API proxy
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          maxTokens: 10,
        }),
      });

      if (response.ok) {
        router.push("/office");
      } else {
        const data = await response.json();
        const errorMsg =
          data.error?.message || data.error || t("invalidKey");
        setError(typeof errorMsg === "string" ? errorMsg : t("invalidKey"));
      }
    } catch {
      setError(t("validationError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[420px]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 text-4xl">🏢</div>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="api-key">Anthropic API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="sk-ant-..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-4">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("validating")}
                </>
              ) : (
                t("start")
              )}
            </Button>
            <Button
              variant="link"
              type="button"
              className="text-sm"
              asChild
            >
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("noKey")}
              </a>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
