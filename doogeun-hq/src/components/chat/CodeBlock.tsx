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
  return (
    <div className="my-2 rounded-lg border border-gray-800/60 bg-[#0b0b14] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/60 border-b border-gray-800/60">
        <span className="text-[11px] text-gray-400 font-mono">
          {title ? <><span className="text-sky-300">{title}</span> · </> : null}
          {language || "text"}
        </span>
        <button onClick={copy} className="text-[11px] text-gray-400 hover:text-sky-200 flex items-center gap-1">
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{ margin: 0, padding: "0.75rem", fontSize: "12px", background: "transparent" }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
