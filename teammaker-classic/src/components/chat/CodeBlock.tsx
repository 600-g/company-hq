"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Props {
  code: string;
  language?: string;
  className?: string;
}

export default function CodeBlock({ code, language, className }: Props) {
  return (
    <SyntaxHighlighter
      language={language || "text"}
      style={oneDark}
      customStyle={{
        margin: 0,
        borderRadius: "0.375rem",
        fontSize: "0.75rem",
        lineHeight: "1.625",
      }}
      className={className}
    >
      {code}
    </SyntaxHighlighter>
  );
}
