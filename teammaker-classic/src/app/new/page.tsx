"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * 신규 앱 (Option C 새판) — 껍데기 단계.
 *
 * 베이스: teammaker-classic 구조
 * 이식 대상 (다음 세션부터 순차):
 *   1. 설정 통합 (API 키 / 모델 / 토큰 / 자동화)
 *   2. 버그 리포트 (이미지 + 자동 GH 이슈)
 *   3. 대화 사진 업로드
 *   4. 에이전트별 스펙 정리 (MD 붙여넣기)
 *   5. 언어 선택 (i18n ko/en)
 *   6. 푸시 알림 (VAPID)
 *   7. 서버실 (모니터 대시보드)
 *   8. 층 분리 (오피스)
 *   9. 에이전트 MD 시스템 프롬프트
 *  10. 로그인 + 초대 코드
 *  11. 강제 새로고침 (캐시버스팅)
 *
 * 아카이브: 두근컴퍼니 구버전(600g.net) / 팀메이커 Classic(/office)
 */
export default function NewPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ROADMAP: { id: string; title: string; desc: string; status: "todo" | "wip" | "done" }[] = [
    { id: "settings",    title: "설정 통합",           desc: "API 키 · 모델 · 외부 토큰 · 자동화 옵션",     status: "todo" },
    { id: "bugreport",   title: "버그 리포트",         desc: "이미지 업로드 + 자동 GH 이슈화",               status: "todo" },
    { id: "chatupload",  title: "대화 사진 업로드",    desc: "드래그/⌘+V 이미지 첨부",                      status: "todo" },
    { id: "agentspec",   title: "에이전트 스펙 정리",  desc: "역할/히스토리/활동 타임라인",                 status: "todo" },
    { id: "i18n",        title: "언어 선택",           desc: "ko / en 전환",                                 status: "todo" },
    { id: "push",        title: "푸시 알림",           desc: "VAPID 웹 푸시",                                status: "todo" },
    { id: "server",      title: "서버실",              desc: "CPU/메모리/네트워크 모니터",                  status: "todo" },
    { id: "floor",       title: "층 분리",             desc: "오피스 다층 구조",                             status: "todo" },
    { id: "agentmd",     title: "에이전트 MD",         desc: "시스템 프롬프트 MD 붙여넣기",                  status: "todo" },
    { id: "auth",        title: "로그인 + 코드",       desc: "초대 코드 부여 + 세션 영속",                   status: "todo" },
    { id: "cachebust",   title: "강제 새로고침",       desc: "SW unregister + 캐시 삭제 + 로그인 보존",      status: "todo" },
  ];

  const todoCnt = ROADMAP.filter(r => r.status === "todo").length;
  const wipCnt  = ROADMAP.filter(r => r.status === "wip").length;
  const doneCnt = ROADMAP.filter(r => r.status === "done").length;

  return (
    <div className="min-h-screen bg-[#0b0b14] text-gray-200 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-[13px] text-gray-500 hover:text-gray-300">← 홈</Link>
          <span className="opacity-40">·</span>
          <h1 className="text-2xl font-bold text-yellow-300">✨ 신규 (새판)</h1>
          <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/30 text-yellow-200 font-bold">BUILDING</span>
        </div>

        <p className="text-[13px] text-gray-400 mb-6 leading-relaxed max-w-2xl">
          팀메이커 구조를 뼈대로, 우리 고유 장점 11가지를 이식하는 새판 빌드.
          색상/폰트/흐름은 팀메이커 기준. 캐릭터/에셋만 우리 것.
        </p>

        <div className="flex gap-2 mb-5 text-[12px] font-mono">
          <span className="px-2 py-1 rounded bg-gray-700/30 text-gray-300">총 {ROADMAP.length}</span>
          <span className="px-2 py-1 rounded bg-green-500/20 text-green-300">완료 {doneCnt}</span>
          <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300">진행 {wipCnt}</span>
          <span className="px-2 py-1 rounded bg-gray-500/20 text-gray-400">대기 {todoCnt}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROADMAP.map((r, i) => (
            <div
              key={r.id}
              className={`p-4 rounded-lg border transition-all ${
                r.status === "done" ? "border-green-500/40 bg-green-900/15"
                : r.status === "wip" ? "border-amber-500/50 bg-amber-900/15"
                : "border-gray-700/50 bg-gray-800/20"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-[13px] text-gray-300 font-bold">
                  {i + 1}. {r.title}
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  r.status === "done" ? "bg-green-500/30 text-green-300"
                  : r.status === "wip" ? "bg-amber-500/30 text-amber-300"
                  : "bg-gray-600/30 text-gray-400"
                }`}>
                  {r.status === "done" ? "완료" : r.status === "wip" ? "진행 중" : "대기"}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 leading-relaxed">{r.desc}</div>
            </div>
          ))}
        </div>

        {mounted && (
          <div className="mt-8 p-4 rounded-lg border border-gray-700/50 bg-gray-900/30">
            <div className="text-[12px] text-gray-400 mb-2">💡 다음 세션 진행 순서</div>
            <ol className="text-[13px] text-gray-300 space-y-1 list-decimal list-inside">
              <li>설정 통합 — TM /settings 확장 (우리 API 키/모델/토큰/푸시 통합)</li>
              <li>로그인 + 초대 코드 — /auth 라우트 + 기존 FastAPI 연동</li>
              <li>버그 리포트 버튼 — TM 레이아웃 고정 위치</li>
              <li>에이전트 MD — 에이전트 생성 시 MD 시스템 프롬프트 필드</li>
              <li>서버실 — 신규 /server 대시보드</li>
              <li>층 분리 — 오피스 다층 라디오</li>
              <li>푸시 알림 · 캐시버스팅 · i18n · 사진업로드 · 스펙정리</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
