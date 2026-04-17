"use client";
import dynamic from "next/dynamic";
import Link from "next/link";

const TeamMakerPreview = dynamic(() => import("./PreviewScene"), { ssr: false });

export default function TeamMakerPreviewPage() {
  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-sm font-semibold text-yellow-400">
          🧪 TeamMaker 타일셋 프리뷰 (102×42)
        </h1>
        <Link href="/" className="text-[13px] text-gray-400 hover:text-yellow-300">
          ← 본래 사무실로
        </Link>
      </div>
      <p className="text-[12px] text-gray-500 mb-3">
        TeamMaker 원본 레이아웃 (default.json) 을 Phaser로 렌더링한 비교용 프리뷰.
        스크롤/드래그로 이동, 휠로 줌.
      </p>
      <TeamMakerPreview />
    </div>
  );
}
