"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "@/components/chat/CodeBlock";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

interface Props { content: string }

export default function MarkdownContent({ content }: Props) {
  return (
    <div className="markdown-content text-[12px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...rest }: ComponentPropsWithoutRef<"code"> & { children?: ReactNode }) {
            const match = /language-(\w+)/.exec(className || "");
            const inline = !match;
            if (inline) {
              return <code className="px-1 py-0.5 rounded bg-gray-800/60 text-sky-200 text-[11px] font-mono" {...rest}>{children}</code>;
            }
            return <CodeBlock code={String(children).replace(/\n$/, "")} language={match[1]} />;
          },
          a({ children, ...rest }) {
            return <a target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline" {...rest}>{children}</a>;
          },
          h1: ({ children }) => <h1 className="text-[14px] font-bold text-gray-100 mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[13px] font-bold text-gray-100 mt-2 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[12px] font-bold text-gray-200 mt-2 mb-0.5">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-sky-400/50 pl-2 my-1 text-gray-400">{children}</blockquote>,
          table: ({ children }) => <div className="overflow-x-auto my-1"><table className="w-full text-[11px] border-collapse">{children}</table></div>,
          th: ({ children }) => <th className="px-2 py-1 border border-gray-800 bg-gray-900/60 font-bold text-left">{children}</th>,
          td: ({ children }) => <td className="px-2 py-1 border border-gray-800">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
