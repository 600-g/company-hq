"use client";

import { useEffect, useState } from "react";
import { X, Check, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { apiBase } from "@/lib/utils";

interface ToolState {
  installed: boolean;
  version: string | null;
  path: string | null;
}

interface CheckResult {
  ok: boolean;
  platform: string;
  tools: Record<string, ToolState>;
}

interface Props {
  onClose: () => void;
}

const REQUIRED = ["node", "git", "npm", "claude"] as const;
const OPTIONAL = ["cloudflared"] as const;

const HELP: Record<string, { label: string; howto: string }> = {
  node: { label: "Node.js", howto: "brew install node 또는 nodejs.org 에서 설치" },
  git: { label: "Git", howto: "Xcode Command Line Tools: xcode-select --install" },
  npm: { label: "npm", howto: "Node.js 함께 설치됨" },
  claude: { label: "Claude Code CLI", howto: "curl -fsSL https://claude.ai/install.sh | sh" },
  cloudflared: { label: "Cloudflare Tunnel", howto: "brew install cloudflared (선택)" },
};

export default function SystemCheckDialog({ onClose }: Props) {
  const [data, setData] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/api/system/check`);
      const j = await r.json();
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "서버 연결 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tools = data?.tools || {};
  const missingRequired = REQUIRED.filter((k) => !tools[k]?.installed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0b0b14] border border-gray-800 rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-11 flex items-center gap-2 px-3 border-b border-gray-800/70">
          <span className="text-[13px] font-bold text-gray-200">환경 체크</span>
          {data?.platform && <span className="text-[10px] text-gray-500 font-mono">{data.platform}</span>}
          <button onClick={load} disabled={loading} className="ml-auto p-1 text-gray-500 hover:text-sky-300">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="text-[11px] p-2 rounded bg-red-500/10 border border-red-500/30 text-red-300">
              연결 실패: {error}
            </div>
          )}

          {!error && missingRequired.length > 0 && (
            <div className="text-[11px] p-2 rounded bg-amber-500/10 border border-amber-500/40 text-amber-200">
              ⚠ 필수 도구 {missingRequired.length}개 누락: {missingRequired.join(", ")}
            </div>
          )}
          {!error && data && missingRequired.length === 0 && (
            <div className="text-[11px] p-2 rounded bg-green-500/10 border border-green-500/40 text-green-300">
              ✓ 모든 필수 도구 설치됨
            </div>
          )}

          <Section title="필수 도구">
            {REQUIRED.map((k) => (
              <ToolRow key={k} name={k} state={tools[k]} />
            ))}
          </Section>

          <Section title="선택 도구">
            {OPTIONAL.map((k) => (
              <ToolRow key={k} name={k} state={tools[k]} optional />
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ToolRow({ name, state, optional }: { name: string; state?: ToolState; optional?: boolean }) {
  const info = HELP[name] || { label: name, howto: "" };
  const installed = !!state?.installed;
  return (
    <div className={`p-2 rounded border ${
      installed ? "border-gray-800/60 bg-gray-900/30" :
      optional ? "border-gray-800/60 bg-gray-900/20" :
      "border-amber-500/30 bg-amber-500/5"
    }`}>
      <div className="flex items-center gap-2">
        {installed ? (
          <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
        ) : optional ? (
          <AlertTriangle className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        )}
        <span className="text-[12px] text-gray-200 font-bold">{info.label}</span>
        <span className="text-[10px] text-gray-500 font-mono truncate flex-1">{name}</span>
        {state?.version && <span className="text-[10px] text-gray-400 font-mono truncate max-w-[160px]" title={state.version}>{state.version}</span>}
      </div>
      {!installed && info.howto && (
        <div className="mt-1 text-[10px] text-gray-500 ml-5.5 pl-1">{info.howto}</div>
      )}
      {state?.path && <div className="mt-0.5 text-[10px] text-gray-600 font-mono truncate ml-5.5 pl-1" title={state.path}>{state.path}</div>}
    </div>
  );
}
