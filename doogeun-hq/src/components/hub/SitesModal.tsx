"use client";

/**
 * 외부 사이트 관리 — 두근컴퍼니가 만든 product 사이트들의 카드 대시보드.
 *
 * - 분리된 사이트(public_url 있음): 카드에 [열기][채팅] 버튼
 * - 미분리 사이트(repo 만 있음): [도메인 추가하기] 1-click → 자동 wiring
 * - 광장(채팅) 진입: onSelectAgent prop 으로 hub 의 selectedAgentId 변경
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, MessageSquare, Globe, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { apiBase } from "@/lib/utils";

interface SiteRow {
  id: string;
  name: string;
  emoji: string;
  category: string;
  repo: string;          // GitHub repo name
  localPath: string;
  publicUrl?: string;    // 추정 — CNAME 파일 있으면 자동 인식 (Phase 2)
  githubPagesUrl: string; // 600-g.github.io/{repo}
  hasRepo: boolean;
}

interface Props {
  onSelectAgent?: (id: string) => void;
}

// 도메인 자동 추론 — CF Proxy 가 자체 SSL 제공 (Universal SSL).
// Geolocation API 등 Secure Context 가 필요한 기능은 https 필수.
const KNOWN_DOMAINS: Record<string, string> = {
  "ai900": "https://exam.600g.net",
  "date-map": "https://datemap.600g.net",
};

export default function SitesModal({ onSelectAgent }: Props) {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [cfTokenOk, setCfTokenOk] = useState<boolean | null>(null);
  const [showDev, setShowDev] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // CF 토큰 상태 — 가이드 표시 여부 결정
      try {
        const tr = await fetch(`${apiBase()}/api/settings/tokens`);
        const td = await tr.json();
        setCfTokenOk(!!td?.tokens?.CF_TOKEN?.configured);
      } catch { setCfTokenOk(null); }

      const r = await fetch(`${apiBase()}/api/teams/info`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("응답 형식 오류");
      // 외부 사이트 후보: product / dev category 중 자체 repo 가 있는 팀
      // (system 팀 제외, light 에이전트 제외)
      const r2 = await fetch(`${apiBase()}/api/teams`);
      const teams = await r2.json();
      const fullList = Array.isArray(teams) ? teams : [];
      const sites: SiteRow[] = fullList
        .filter((t: { id: string; category?: string; lightweight?: boolean; repo?: string }) =>
          t.category !== "system" &&
          !t.lightweight &&
          (t.repo && t.repo !== "company-hq" && t.repo !== "-"),
        )
        .map((t: { id: string; name: string; emoji: string; category: string; repo: string; localPath?: string }) => ({
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          category: t.category,
          repo: t.repo,
          localPath: t.localPath || "",
          publicUrl: KNOWN_DOMAINS[t.id],
          githubPagesUrl: `https://600-g.github.io/${t.repo}/`,
          hasRepo: !!t.repo,
        }));
      // 카테고리별 정렬: product 먼저, 나머지(dev)는 뒤로
      sites.sort((a, b) => {
        if (a.category === "product" && b.category !== "product") return -1;
        if (a.category !== "product" && b.category === "product") return 1;
        return 0;
      });
      setRows(sites);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setupSubdomain = async (id: string, defaultSub: string) => {
    const sub = prompt(
      `${id} 에 도메인 추가\n\n서브도메인 (영문 소문자/숫자)\n예: exam → exam.600g.net`,
      defaultSub,
    );
    if (!sub) return;
    const clean = sub.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!clean) return;

    setBusyId(id);
    setResultMsg(null);
    try {
      const r = await fetch(`${apiBase()}/api/teams/${id}/setup-subdomain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: clean }),
      });
      const data = await r.json();
      if (!data.ok) {
        const stage = data.stage ? ` [${data.stage}]` : "";
        setResultMsg(`❌ ${data.error}${stage}`);
        return;
      }
      setResultMsg(`✅ ${data.url} 생성! (SSL 5분~1시간 후 활성)`);
      await load();
    } catch (e) {
      setResultMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  // 카드 렌더 — product / dev 양쪽에서 재사용
  const renderCard = (s: SiteRow) => {
    const liveUrl = s.publicUrl || s.githubPagesUrl;
    const hasOwnDomain = !!s.publicUrl;
    return (
      <div
        key={s.id}
        className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/30 hover:border-sky-400/30 transition-colors space-y-2"
      >
        <div className="flex items-start gap-2">
          <span className="text-2xl">{s.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-gray-100 truncate">{s.name}</div>
            <div className="text-[10px] text-gray-500 font-mono truncate">{s.repo}</div>
          </div>
          {hasOwnDomain ? (
            <Badge variant="success" className="text-[10px]">분리됨</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">github.io</Badge>
          )}
        </div>

        <div className="text-[11px] text-gray-400 font-mono truncate" title={liveUrl}>
          <Globe className="w-3 h-3 inline mr-1 mb-0.5" />
          {liveUrl.replace(/^https?:\/\//, "")}
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> 열기
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => onSelectAgent?.(s.id)}
            title="이 프로덕트 담당 에이전트와 채팅 — 사이트 패치/개선 요청"
          >
            <MessageSquare className="w-3 h-3 mr-1" /> 채팅
          </Button>
          {!hasOwnDomain && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2 ml-auto border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/10"
              disabled={busyId === s.id}
              onClick={() => setupSubdomain(s.id, s.id.replace(/[^a-z0-9]/g, ""))}
            >
              {busyId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "🌐 도메인 추가"}
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        사이트 목록 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-lg bg-red-500/10 border border-red-400/30 text-red-200">
        <AlertCircle className="w-4 h-4 inline mr-1" /> 불러오기 실패: {error}
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* CF 토큰 미설정 시: 시작 가이드 (토큰 등록되면 자동 숨김) */}
      {cfTokenOk === false && (
        <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/10 to-sky-500/10 border border-amber-400/30 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span className="text-[14px] font-bold text-gray-100">🚀 첫 시작 — 도메인 자동 발급 켜기 (5분)</span>
          </div>
          <div className="text-[12px] text-gray-300 leading-relaxed">
            본인 도메인의 서브도메인 (예: <code className="text-emerald-300">puzzle.600g.net</code>)을
            자동으로 발급하려면 <strong>Cloudflare 토큰</strong> 1회 등록 필요.
          </div>
          <ol className="text-[12px] text-gray-200 space-y-1.5 pl-4 list-decimal">
            <li>
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300 hover:underline font-bold"
              >
                Cloudflare 토큰 발급 페이지 열기 ↗
              </a>
              {" "}→ <span className="text-gray-400">[Create Token] 클릭</span>
            </li>
            <li>
              템플릿 <strong className="text-gray-100">"Edit zone DNS"</strong> → Use template
            </li>
            <li>
              Zone Resources → <strong>Specific zone</strong> → 본인 도메인 선택
            </li>
            <li>
              Continue → Create Token → <strong>토큰 복사</strong> (한 번만 보임!)
            </li>
            <li>
              <Link
                href="/settings"
                className="text-sky-300 hover:underline font-bold"
              >
                설정 페이지 가서 ↗
              </Link>
              {" "}Cloudflare 칸에 붙여넣고 [저장]
            </li>
          </ol>
          <div className="flex items-center gap-2 pt-1 text-[11px] text-amber-200/80">
            ⓘ 등록 후 이 모달 새로고침 (다시 열기) 하면 가이드 사라지고 [도메인 추가] 버튼 활성화
          </div>
        </div>
      )}

      <div className="text-[12px] text-gray-400 leading-relaxed">
        🚀 두근컴퍼니가 만든 프로덕트 모음. <strong className="text-gray-200">분리된 프로덕트</strong>는 자체 도메인 + 호스팅으로
        두근컴퍼니가 꺼져도 정상 작동합니다. 미분리 프로덕트는 <strong className="text-emerald-300">[도메인 추가하기]</strong> 클릭하면
        본인 Cloudflare 토큰으로 자동 발급됩니다 (5분 후 라이브).
      </div>

      {resultMsg && (
        <div className={`p-2.5 rounded text-[12px] ${resultMsg.startsWith("✅") ? "bg-emerald-500/10 border border-emerald-400/30 text-emerald-200" : "bg-red-500/10 border border-red-400/30 text-red-200"}`}>
          {resultMsg}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-[13px]">
          프로덕트가 아직 없습니다. <br />
          <span className="text-[11px]">에이전트를 만들 때 "🚀 프로덕트로 만들기" 옵션을 켜면 자동 등록됩니다.</span>
        </div>
      ) : (
        <>
          {/* 🚀 프로덕트 — 메인 (date-map / ai900 등) */}
          {rows.filter((s) => s.category === "product").length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                🚀 프로덕트
                <span className="text-[10px] font-normal text-gray-500">
                  ({rows.filter((s) => s.category === "product").length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rows.filter((s) => s.category === "product").map(renderCard)}
              </div>
            </div>
          )}

          {/* 💻 내부 개발 도구 — 접힘 (frontend/backend/design 등) */}
          {rows.filter((s) => s.category !== "product").length > 0 && (
            <div className="space-y-2 pt-3 border-t border-gray-800/60">
              <button
                onClick={() => setShowDev(!showDev)}
                className="w-full flex items-center gap-2 text-[11px] font-bold text-gray-400 hover:text-gray-200 uppercase tracking-wider"
                title="dev 카테고리 (프론트엔드/백엔드/디자인 등) — 프로덕트 아닌 내부 도구"
              >
                <span className={`text-[9px] transition-transform ${showDev ? "rotate-90" : ""}`}>▶</span>
                💻 내부 개발 도구
                <span className="text-[10px] font-normal text-gray-500">
                  ({rows.filter((s) => s.category !== "product").length})
                </span>
                <span className="text-[10px] font-normal text-gray-500 ml-auto">{showDev ? "접기" : "펼치기"}</span>
              </button>
              {showDev && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-90">
                  {rows.filter((s) => s.category !== "product").map(renderCard)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="text-[11px] text-gray-500 pt-2 border-t border-gray-800/60">
        💡 <strong>도메인 추가가 안 되면</strong> 설정 페이지에서 Cloudflare 토큰 입력 확인.
      </div>
    </div>
  );
}
