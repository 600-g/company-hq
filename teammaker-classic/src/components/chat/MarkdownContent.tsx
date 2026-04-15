"use client";

import ReactMarkdown from "react-markdown";
import CodeBlock from "@/components/chat/CodeBlock";

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownContent({ content, className }: Props) {
  const processed = content;

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none break-words ${className ?? ""}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 text-sm leading-relaxed">{children}</p>,
          h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mt-2.5 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          code: ({ children, className: codeClass }) => {
            const match = codeClass?.match(/language-(\w+)/);
            const content = String(children).replace(/\n$/, "");
            if (match || content.includes("\n")) {
              return (
                <CodeBlock
                  code={content}
                  language={match?.[1] || "text"}
                />
              );
            }
            return (
              <code className="bg-black/20 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
            );
          },
          pre: ({ children }) => (
            <div className="my-1.5 overflow-hidden rounded-md">{children}</div>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-1.5 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-muted-foreground/20 my-2" />,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
              {children}
            </a>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
