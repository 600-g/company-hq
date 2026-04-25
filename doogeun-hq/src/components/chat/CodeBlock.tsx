"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";

interface Props {
  code: string;
  language?: string;
  title?: string;
}

export default function CodeBlock({ code, language, title }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  // 코드블록은 라이트/다크 테마 관계없이 항상 다크 배경 — oneDark 색상이 밝은 bg 에서 안 보임
  return (
    <div className="my-2 rounded-lg border border-gray-700 overflow-hidden" style={{ background: "#1e1e2e" }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ background: "#181825", borderColor: "#313244" }}>
        <span className="text-[11px] font-mono" style={{ color: "#a6adc8" }}>
          {title ? <><span style={{ color: "#89b4fa" }}>{title}</span> <span style={{ color: "#6c7086" }}>·</span> </> : null}
          {language || "text"}
        </span>
        <button onClick={copy} className="text-[11px] flex items-center gap-1 hover:opacity-100" style={{ color: "#a6adc8", opacity: 0.8 }}>
          {copied ? <Check className="w-3 h-3" style={{ color: "#a6e3a1" }} /> : <Copy className="w-3 h-3" />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{ margin: 0, padding: "0.75rem", fontSize: "12.5px", background: "#1e1e2e", color: "#cdd6f4" }}
        codeTagProps={{ style: { background: "transparent", fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace" } }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
