"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { History, Settings } from "lucide-react";
import SessionHistoryPanel from "@/components/layout/SessionHistoryPanel";

export default function TopBar() {
  const router = useRouter();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  return (
    <header className="flex h-12 items-center border-b px-4 bg-background">
      <span className="font-semibold text-lg">TeamMaker</span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsHistoryOpen(true)}
          className="h-8 w-8"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/settings")}
          className="h-8 w-8"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <SessionHistoryPanel
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
    </header>
  );
}
