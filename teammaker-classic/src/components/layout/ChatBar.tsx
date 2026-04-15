"use client";

import { useTranslations } from "next-intl";
import { useChatStore } from "@/stores/chatStore";
import { useChatSend } from "@/hooks/useChatSend";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare } from "lucide-react";

export default function ChatBar() {
  const t = useTranslations("chat");
  const setExpanded = useChatStore((s) => s.setExpanded);
  const { input, setInput, handleSend, handleKeyDown, phase } = useChatSend();

  return (
    <footer className="flex h-14 items-center border-t px-4 gap-2 bg-background">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setExpanded(true)}
        className="h-8 w-8"
      >
        <MessageSquare className="h-4 w-4" />
      </Button>
      <Input
        placeholder={
          phase === "refining"
            ? t("placeholderRefining")
            : t("placeholderAgent")
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={phase === "executing"}
        className="flex-1"
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={!input.trim() || phase === "executing"}
        className="h-8 w-8"
      >
        <Send className="h-4 w-4" />
      </Button>
    </footer>
  );
}
