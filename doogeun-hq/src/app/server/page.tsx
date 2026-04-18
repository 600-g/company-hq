"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu, HardDrive, Wifi, Activity } from "lucide-react";
import { apiBase } from "@/lib/utils";

interface Status {
  cpu?: number;
  mem?: number;
  disk?: number;
  net_up?: number;
  net_down?: number;
  processes?: number;
  uptime?: number;
}

export default function ServerPage() {
  const [status, setStatus] = useState<Status>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${apiBase()}/api/dashboard`);
        const d = await r.json();
        if (!cancelled) setStatus(d || {});
      } catch {
        if (!cancelled) setErr("서버 연결 실패");
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="두근컴퍼니 HQ — 서버실" />
      <main className="flex-1 p-6 max-w-4xl w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4" /> 서버 상태 (실시간 3초 폴링)
            </CardTitle>
            <CardDescription>{err ? <span className="text-red-400">{err}</span> : "FastAPI /api/dashboard 연결됨"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Cpu} label="CPU" value={status.cpu != null ? `${status.cpu}%` : "?"} />
              <Stat icon={HardDrive} label="메모리" value={status.mem != null ? `${status.mem}%` : "?"} />
              <Stat icon={HardDrive} label="디스크" value={status.disk != null ? `${status.disk}%` : "?"} />
              <Stat icon={Wifi} label="프로세스" value={status.processes != null ? `${status.processes}` : "?"} />
            </div>
            <pre className="mt-4 p-3 rounded bg-black/40 border border-gray-800 text-[11px] text-gray-400 font-mono overflow-x-auto">
{JSON.stringify(status, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/40 flex items-center gap-3">
      <Icon className="w-5 h-5 text-blue-300" />
      <div>
        <div className="text-[10px] text-gray-500 uppercase">{label}</div>
        <div className="text-lg font-bold text-gray-100">{value}</div>
      </div>
    </div>
  );
}
