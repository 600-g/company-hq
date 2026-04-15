"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import TopBar from "@/components/layout/TopBar";
import Palette from "@/components/layout/Palette";
import ChatBar from "@/components/layout/ChatBar";
import ChatPanel from "@/components/layout/ChatPanel";
import AgentCreateModal from "@/components/agent/AgentCreateModal";
import AgentConfigModal from "@/components/agent/AgentConfigModal";
import AgentDetailPanel from "@/components/agent/AgentDetailPanel";
import TerminalPanel from "@/components/terminal/TerminalPanel";
import EditorToolbar from "@/components/editor/EditorToolbar";
import FurniturePalette from "@/components/editor/FurniturePalette";
import LayoutActions from "@/components/editor/LayoutActions";
import TileSelector from "@/components/canvas/TileSelector";
import { isEditorEnabled, loadDefaultPresetIfNeeded } from "@/stores/officeStore";

// Dynamic import for PixiJS (CSR only)
const OfficeCanvas = dynamic(
  () => import("@/components/canvas/OfficeCanvas"),
  { ssr: false }
);

export default function OfficePage() {
  const router = useRouter();
  const isApiKeyValid = useSettingsStore((s) => s.isApiKeyValid);
  const testMode = useSettingsStore((s) => s.testMode);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const openAgentConfig = useUIStore((s) => s.openAgentConfig);
  const [loaded, setLoaded] = useState(false);
  const [editorMode] = useState(() => isEditorEnabled());

  // Agent creation flow state
  const [pendingAgent, setPendingAgent] = useState<{
    name: string;
    description: string;
    role: string;
    outputHint?: string;
    steps?: string[];
    position: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    loadSettings().then(() => setLoaded(true));
    loadDefaultPresetIfNeeded();
  }, [loadSettings]);

  useEffect(() => {
    if (loaded && !isApiKeyValid && !testMode) {
      router.replace("/setup");
    }
  }, [loaded, isApiKeyValid, testMode, router]);

  const handleConfigGenerated = useCallback(
    (
      name: string,
      description: string,
      role: string,
      outputHint: string | undefined,
      steps: string[] | undefined,
      position: { x: number; y: number }
    ) => {
      setPendingAgent({ name, description, role, outputHint, steps, position });
      openAgentConfig();
    },
    [openAgentConfig]
  );

  const handleAgentConfirmed = useCallback(() => {
    setPendingAgent(null);
  }, []);

  if (!loaded || (!isApiKeyValid && !testMode)) return null;

  return (
    <div className="flex h-screen flex-col">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <Palette />

        <main className="relative flex-1">
          <OfficeCanvas />
          {editorMode && (
            <>
              <EditorToolbar />
              <FurniturePalette />
              <TileSelector />
              <LayoutActions />
            </>
          )}
        </main>
      </div>

      <TerminalPanel />
      <ChatBar />

      {/* Modals & Panels */}
      <AgentCreateModal onConfigGenerated={handleConfigGenerated} />
      {pendingAgent && (
        <AgentConfigModal
          agentName={pendingAgent.name}
          agentDescription={pendingAgent.description}
          role={pendingAgent.role}
          outputHint={pendingAgent.outputHint}
          steps={pendingAgent.steps}
          position={pendingAgent.position}
          onConfirm={handleAgentConfirmed}
        />
      )}
      <AgentDetailPanel />
      <ChatPanel />
    </div>
  );
}
