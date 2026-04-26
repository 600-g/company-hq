"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  code: string;
  language?: string;
  title?: string;
}

/**
 * 터미널 스타일 코드블록 — 라이트/다크 모드 무관하게 항상 다크 배경 + 단색 모노스페이스 텍스트.
 * 색깔별 syntax highlighting 일부러 사용 안 함 (유저 요청: "녹색이라 안 보임 → 터미널 느낌")
 * iTerm/터미널 에서 코드 보는 그 느낌 그대로.
 */
export default function CodeBlock({ code, language, title }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // 터미널 팔레트 — 항상 다크
  const BG = "#0d1117";        // GitHub Dark base
  const HEAD_BG = "#161b22";   // 살짝 밝은 헤더
  const BORDER = "#30363d";
  const TEXT = "#e6edf3";      // 밝은 회백 — 모든 코드 단일 색
  const MUTED = "#8b949e";
  const ACCENT = "#58a6ff";    // title 만 살짝 강조
  const CHECK = "#3fb950";

  return (
    <div
      className="my-2 rounded-lg overflow-hidden"
      style={{ background: BG, border: `1px solid ${BORDER}` }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ background: HEAD_BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <span className="text-[11px] font-mono flex items-center gap-1.5" style={{ color: MUTED }}>
          {/* macOS 터미널 점 3개 */}
          <span className="flex gap-1 mr-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "#ff5f56" }} />
            <span className="w-2 h-2 rounded-full" style={{ background: "#ffbd2e" }} />
            <span className="w-2 h-2 rounded-full" style={{ background: "#27c93f" }} />
          </span>
          {title ? (
            <>
              <span style={{ color: ACCENT }}>{title}</span>
              <span style={{ color: MUTED, opacity: 0.6 }}>·</span>
            </>
          ) : null}
          <span>{language || "text"}</span>
        </span>
        <button
          onClick={copy}
          className="text-[11px] flex items-center gap-1 hover:opacity-100"
          style={{ color: MUTED, opacity: 0.8 }}
        >
          {copied ? <Check className="w-3 h-3" style={{ color: CHECK }} /> : <Copy className="w-3 h-3" />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "0.75rem",
          fontSize: "12.5px",
          lineHeight: 1.55,
          background: BG,
          color: TEXT,
          fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
          overflow: "auto",
          whiteSpace: "pre",
          tabSize: 2,
        }}
      >
        <code style={{ background: "transparent", color: "inherit", fontFamily: "inherit" }}>
          {code}
        </code>
      </pre>
    </div>
  );
}
