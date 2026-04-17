"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

/**
 * 두근컴퍼니 통합 홈 (Option B).
 *
 * 우리 Office.tsx 를 팀메이커 베이스 위에서 그대로 렌더.
 * - 픽셀 오피스 (Phaser)
 * - 통합 채팅 + @멘션
 * - 에이전트 스펙/로그
 * - Session/Deploy/Artifacts 전부 동작
 *
 * FastAPI 백엔드(localhost:8000 / api.600g.net) 그대로 사용.
 */
const Office = dynamic(() => import("@/components/doogeun/app/components/Office"), { ssr: false });

export default function DoogeunPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <Office />;
}
