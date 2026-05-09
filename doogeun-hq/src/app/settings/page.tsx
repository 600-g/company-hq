"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Check, Sun, Moon, Server } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import InfoBadge from "@/components/InfoBadge";
import { useThemeStore } from "@/stores/themeStore";
import { apiBase } from "@/lib/utils";

// 외부 서비스 토큰 — 본인 계정 키를 입력해 사이트/레포를 자기 계정에 만들 때 사용
// (안 쓰면 빈 값 유지 — 호스트 .env 토큰으로 fallback)
const TOKEN_KEYS = [
  {
    key: "GITHUB_TOKEN",
    label: "GitHub",
    help: "레포 생성·푸시 (본인 계정 키 권장)",
    info: "에이전트가 만든 코드를 저장할 곳",
    detail:
      "GitHub은 코드 저장소 서비스입니다.\n\n" +
      "에이전트가 사이트나 게임을 만들면 그 코드를 GitHub에 자동 저장해요. 본인 GitHub 토큰을 넣으면 본인 계정에 저장됩니다.\n\n" +
      "📋 토큰 발급 방법:\n" +
      "1. github.com 로그인 → 우상단 프로필 → Settings\n" +
      "2. 좌측 맨 아래 Developer settings\n" +
      "3. Personal access tokens → Tokens (classic) → Generate new token (classic)\n" +
      "4. 권한: repo (전체) 체크\n" +
      "5. 만료: No expiration\n" +
      "6. 생성된 토큰 복사 (1번만 보임)",
    link: { href: "https://github.com/settings/tokens/new", label: "GitHub 토큰 발급 페이지 열기" },
  },
  {
    key: "CF_TOKEN",
    label: "Cloudflare",
    help: "사이트 배포 + 도메인 자동 발급 (game.600g.net 같은 서브도메인)",
    info: "사이트를 인터넷에 띄우는 곳",
    detail:
      "Cloudflare는 무료로 사이트를 호스팅하고 도메인을 관리해주는 서비스입니다.\n\n" +
      "이 토큰을 넣으면 두근컴퍼니가 새 에이전트 만들 때 자동으로 본인 도메인의 서브도메인을 발급합니다 (예: puzzle.600g.net).\n\n" +
      "📋 토큰 발급 방법 (3분):\n" +
      "1. dash.cloudflare.com 로그인\n" +
      "2. 우상단 프로필 → My Profile\n" +
      "3. 좌측 메뉴 → API Tokens → Create Token\n" +
      "4. 'Edit zone DNS' 템플릿 → Use template\n" +
      "5. Zone Resources → Specific zone → 본인 도메인 선택\n" +
      "6. Continue → Create Token → 토큰 복사",
    link: { href: "https://dash.cloudflare.com/profile/api-tokens", label: "Cloudflare 토큰 발급 페이지 열기" },
  },
] as const;

export default function SettingsPage() {
  const {
    apiKey, maskedApiKey, setApiKey, clearApiKey,
    tokens, setToken, clearToken,
    testMode, setTestMode,
    autoDeploy, setAutoDeploy,
    agentLanguage, setAgentLanguage,
    npcLanguage, setNpcLanguage,
  } = useSettingsStore();

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [apiInput, setApiInput] = useState("");
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [serverTokens, setServerTokens] = useState<Record<string, { configured: boolean; masked: string }>>({});

  useEffect(() => {
    fetch(`${apiBase()}/api/settings/tokens`)
      .then((r) => r.json())
      .then((d) => { if (d.ok && d.tokens) setServerTokens(d.tokens); })
      .catch(() => {});
  }, []);

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
      <TopBar title="두근컴퍼니 · 설정" />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-4">
        {/* 테마 */}
        <Card>
          <CardHeader>
            <CardTitle>테마</CardTitle>
            <CardDescription>다크 / 라이트 선택. 하단 캐릭 전체에 즉시 반영.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme("dark")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  theme === "dark"
                    ? "border-sky-400/50 bg-sky-500/10"
                    : "border-gray-700/60 bg-gray-800/20 hover:bg-gray-700/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Moon className="w-4 h-4 text-sky-300" />
                  <span className="font-bold text-[13px]">다크</span>
                  {theme === "dark" && <Check className="w-3 h-3 text-green-400 ml-auto" />}
                </div>
                <div className="text-[11px] text-gray-400">어두운 배경, 밝은 글씨</div>
              </button>
              <button
                onClick={() => setTheme("light")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  theme === "light"
                    ? "border-sky-400/50 bg-sky-500/10"
                    : "border-gray-700/60 bg-gray-800/20 hover:bg-gray-700/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sun className="w-4 h-4 text-sky-300" />
                  <span className="font-bold text-[13px]">라이트</span>
                  {theme === "light" && <Check className="w-3 h-3 text-green-400 ml-auto" />}
                </div>
                <div className="text-[11px] text-gray-400">흰 배경 + 딥블루 액센트</div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* 언어 */}
        <Card>
          <CardHeader>
            <CardTitle>언어 설정</CardTitle>
            <CardDescription>에이전트 응답 언어 + NPC 말풍선 언어 (개별 에이전트 override 가능 — 추후 작업)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[12px] text-gray-400 mb-1.5">에이전트 기본</div>
                <select
                  value={agentLanguage}
                  onChange={(e) => { setAgentLanguage(e.target.value as "ko" | "en" | "ja" | "zh"); flash(`에이전트 언어: ${e.target.value}`); }}
                  className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-100 text-[13px]"
                >
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                  <option value="zh">中文</option>
                </select>
              </div>
              <div>
                <div className="text-[12px] text-gray-400 mb-1.5">NPC 말풍선</div>
                <select
                  value={npcLanguage}
                  onChange={(e) => { setNpcLanguage(e.target.value as "ko" | "en" | "ja" | "zh"); flash(`NPC 언어: ${e.target.value}`); }}
                  className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-100 text-[13px]"
                >
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                  <option value="zh">中文</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

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

        {/* 모델은 에이전트별 설정으로 이전 — 글로벌 모델 선택 UI 제거
            (에이전트 카드 → 편집 → 모델 섹션에서 Haiku/Sonnet/Opus 개별 지정) */}

        {/* 외부 토큰 */}
        <Card>
          <CardHeader>
            <CardTitle>외부 서비스 토큰</CardTitle>
            <CardDescription>
              GitHub / Cloudflare — 에이전트가 만든 사이트를 본인 계정에 배포할 때 사용.
              <span className="block mt-1 text-[11px]">
                🟢 비워두면 호스트 <code>.env</code> 토큰 자동 사용. 본인 키 넣으면 본인 GitHub/CF 계정에 배포.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {TOKEN_KEYS.map((tk) => {
              const { key, label, help, info, detail } = tk;
              const link = ("link" in tk ? tk.link : undefined) as { href: string; label: string } | undefined;
              const entry = tokens[key];
              const server = serverTokens[key];
              const serverOk = server?.configured;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-28 text-[13px] text-gray-300 font-bold shrink-0 flex items-center gap-1">
                    {label}
                    <InfoBadge text={info} detail={detail} link={link} />
                  </div>
                  {serverOk && !entry.configured && (
                    <>
                      <span className="text-[12px] text-gray-400 font-mono">{server.masked}</span>
                      <Badge variant="success" className="ml-auto flex items-center gap-1">
                        <Server className="w-3 h-3" /> 서버 .env
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => {
                        const v = prompt(`${label} 브라우저 오버라이드 (비워두면 서버 사용)`);
                        if (v && v.trim()) { setTokenInputs((p) => ({ ...p, [key]: v.trim() })); }
                      }}>
                        오버라이드
                      </Button>
                    </>
                  )}
                  {entry.configured && (
                    <>
                      <span className="text-[12px] text-gray-400 font-mono">{entry.masked}</span>
                      <Badge variant="default" className="ml-auto">브라우저 저장</Badge>
                      <Button variant="ghost" size="sm" onClick={() => clearToken(key)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  {!entry.configured && !serverOk && (
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
                className="w-4 h-4 accent-sky-400"
              />
            </label>

            <div className="h-px bg-gray-800/60 my-3" />

            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <div>
                <div className="text-[13px] text-gray-300 font-bold">
                  자동 배포 <span className="text-[10px] text-amber-400 font-normal ml-1">⚠ 실험적</span>
                </div>
                <div className="text-[11px] text-gray-500 leading-relaxed">
                  에이전트 응답이 검증 통과하면 <span className="text-sky-300">즉시 GitHub push + CF 배포</span> 실행.
                  OFF 면 🚀 배포 버튼 수동 클릭.
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoDeploy}
                onChange={(e) => setAutoDeploy(e.target.checked)}
                className="w-4 h-4 accent-sky-400"
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
