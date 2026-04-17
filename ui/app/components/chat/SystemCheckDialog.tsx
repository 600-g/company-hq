"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle, XCircle, Loader2, ExternalLink, RefreshCw, X } from "lucide-react";

interface ToolStatus {
  installed: boolean;
  version: string | null;
  path?: string | null;
}

const DOWNLOAD_URLS: Record<string, string> = {
  node: "https://nodejs.org/en/download/",
  git: "https://git-scm.com/downloads",
  cloudflared: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
  claude: "https://docs.claude.com/en/docs/claude-code/quickstart",
};

interface Props {
  open: boolean;
  onClose: () => void;
  apiBase: string;
}

export default function SystemCheckDialog({ open, onClose, apiBase }: Props) {
  const [tools, setTools] = useState<Record<string, ToolStatus>>({});
  const [platform, setPlatform] = useState("");
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/system/check`);
      const d = await r.json();
      if (d.ok) {
        setTools(d.tools || {});
        setPlatform(d.platform || "");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const entries = Object.entries(tools);
  const missing = entries.filter(([, s]) => !s.installed);

  return (
    <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f0f1f] border border-[#3a3a5a] rounded-lg w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-yellow-400">🔧 시스템 체크</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-[13px] text-gray-400 mb-3">
          {missing.length === 0
            ? "✅ 모든 도구가 설치되어 있습니다"
            : `⚠️ ${missing.length}개 도구 누락 — 설치 필요`}
          {platform && <span className="ml-1 text-gray-600">({platform})</span>}
        </p>

        <div className="space-y-1.5">
          {entries.map(([name, status]) => (
            <div key={name} className="flex items-center gap-2 rounded border border-[#2a2a4a] bg-[#1a1a2e] p-2">
              {status.installed ? (
                <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-200">{name}</div>
                {status.version && <div className="text-[12px] text-gray-500 font-mono truncate">{status.version}</div>}
                {status.path && <div className="text-[13px] text-gray-600 font-mono truncate">{status.path}</div>}
              </div>
              {!status.installed && DOWNLOAD_URLS[name] && (
                <Button size="sm" variant="outline" className="h-6 text-[12px]"
                  onClick={() => window.open(DOWNLOAD_URLS[name], "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="h-3 w-3 mr-1" />설치
                </Button>
              )}
              {status.installed && <Badge variant="secondary" className="text-[13px]">OK</Badge>}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={check} disabled={loading}>
            {loading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />체크 중</> : <><RefreshCw className="h-3 w-3 mr-1" />재확인</>}
          </Button>
          <Button size="sm" onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}
