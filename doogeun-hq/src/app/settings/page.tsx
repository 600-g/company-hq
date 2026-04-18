"use client";

import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Brain, Sparkles, Trash2, Check } from "lucide-react";
import { useSettingsStore, type ClaudeModel } from "@/stores/settingsStore";

const MODELS: { id: ClaudeModel; name: string; desc: string; icon: typeof Zap }[] = [
  { id: "haiku",  name: "Haiku",  desc: "빠르고 저렴. 간단한 분류/답변.",              icon: Zap },
  { id: "sonnet", name: "Sonnet", desc: "균형. 일반 코딩 기본값.",                    icon: Brain },
  { id: "opus",   name: "Opus",   desc: "최고 품질. 복잡 아키텍처/분석.",             icon: Sparkles },
];

const TOKEN_KEYS = [
  { key: "GITHUB_TOKEN",          label: "GitHub",        help: "레포 생성·푸시" },
  { key: "VERCEL_TOKEN",          label: "Vercel",        help: "프론트 배포" },
  { key: "CF_TOKEN",              label: "Cloudflare",    help: "Pages 배포" },
  { key: "SUPABASE_ACCESS_TOKEN", label: "Supabase",      help: "DB/Auth 프로비전" },
] as const;

export default function SettingsPage() {
  const {
    apiKey, maskedApiKey, setApiKey, clearApiKey,
    selectedModel, setModel,
    tokens, setToken, clearToken,
    testMode, setTestMode,
  } = useSettingsStore();

  const [apiInput, setApiInput] = useState("");
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const flash = (msg: string) => {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 1500);
  };

  const saveApi = () => {
    if (!apiInput.trim()) return;
    setApiKey(apiInput.trim());
    setApiInput("");
    flash("API 키 저장");
  };

  const saveToken = (key: keyof typeof tokens) => {
    const v = tokenInputs[key] || "";
    if (!v.trim()) return;
    setToken(key, v.trim());
    setTokenInputs((p) => ({ ...p, [key]: "" }));
    flash(`${key} 저장`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="두근컴퍼니 HQ — 설정" />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-4">
        {/* API 키 */}
        <Card>
          <CardHeader>
            <CardTitle>Anthropic API 키</CardTitle>
            <CardDescription>
              Claude CLI(Max 플랜)를 쓴다면 비워도 됨. API 직접 호출용.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {apiKey ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-gray-300 font-mono">{maskedApiKey}</span>
                <Badge variant="success"><Check className="w-3 h-3 mr-1" /> 설정됨</Badge>
                <Button variant="ghost" size="sm" onClick={clearApiKey}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiInput}
                  onChange={(e) => setApiInput(e.target.value)}
                />
                <Button onClick={saveApi}>저장</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 모델 선택 */}
        <Card>
          <CardHeader>
            <CardTitle>모델</CardTitle>
            <CardDescription>작업마다 모델 자동 선택 (빠른 작업은 Haiku 로 다운그레이드)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {MODELS.map((m) => {
                const active = selectedModel === m.id;
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      active
                        ? "border-yellow-400/60 bg-yellow-500/10"
                        : "border-gray-700/60 bg-gray-800/20 hover:bg-gray-700/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-yellow-300" />
                      <span className="font-bold text-[13px]">{m.name}</span>
                      {active && <Check className="w-3 h-3 text-green-400 ml-auto" />}
                    </div>
                    <div className="text-[11px] text-gray-400">{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 외부 토큰 */}
        <Card>
          <CardHeader>
            <CardTitle>외부 서비스 토큰</CardTitle>
            <CardDescription>GitHub / Vercel / Cloudflare / Supabase — 배포·프로비전 용</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {TOKEN_KEYS.map(({ key, label, help }) => {
              const entry = tokens[key];
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-28 text-[13px] text-gray-300 font-bold shrink-0">{label}</div>
                  {entry.configured ? (
                    <>
                      <span className="text-[12px] text-gray-400 font-mono">{entry.masked}</span>
                      <Badge variant="success" className="ml-auto">설정됨</Badge>
                      <Button variant="ghost" size="sm" onClick={() => clearToken(key)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Input
                        type="password"
                        placeholder={help}
                        value={tokenInputs[key] || ""}
                        onChange={(e) => setTokenInputs((p) => ({ ...p, [key]: e.target.value }))}
                      />
                      <Button size="sm" onClick={() => saveToken(key)}>저장</Button>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* 자동화 */}
        <Card>
          <CardHeader>
            <CardTitle>자동화</CardTitle>
            <CardDescription>테스트 모드 / 자동 실행 한도 등</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <div>
                <div className="text-[13px] text-gray-300 font-bold">테스트 모드</div>
                <div className="text-[11px] text-gray-500">실제 API 호출 안 함 (개발용)</div>
              </div>
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
                className="w-4 h-4 accent-yellow-400"
              />
            </label>
          </CardContent>
        </Card>

        {savedFlash && (
          <div className="fixed bottom-4 right-4 px-3 py-1.5 rounded-md bg-green-500/20 border border-green-400/50 text-green-200 text-[13px] font-mono">
            ✅ {savedFlash}
          </div>
        )}
      </main>
    </div>
  );
}
