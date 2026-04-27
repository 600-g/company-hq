"use client";

import { useEffect, useState } from "react";
import { X, RefreshCw, Zap, ShieldCheck, Loader2, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { apiBase } from "@/lib/utils";

interface AppProc {
  name: string;
  rss_mb: number;
  pids: number[];
  category: "protected" | "terminable" | "other";
}
interface SysMem {
  used_mb: number;
  free_mb: number;
  total_mb: number;
  swap_used_mb: number;
}
interface StatusResp {
  ok: boolean;
  system: SysMem;
  apps: AppProc[];
}
interface OptimizeResp {
  ok: boolean;
  killed: { name: string; method: string; ok?: boolean; error?: string }[];
  skipped: { name: string; reason: string }[];
  before?: SysMem;
  after?: SysMem;
  freed_mb: number;
}

export default function MemoryOptimizerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizeResp | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/admin/memory/status`, { cache: "no-store" });
      const d = await r.json();
      if (d.ok) setStatus(d);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      refresh();
      setResult(null);
      setSelected(new Set());
    }
  }, [open]);

  const toggleAll = () => {
    if (!status) return;
    const terminable = status.apps.filter((a) => a.category !== "protected");
    if (selected.size === terminable.length) setSelected(new Set());
    else setSelected(new Set(terminable.map((a) => a.name)));
  };

  const toggleOne = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const recommendOnly = () => {
    if (!status) return;
    setSelected(new Set(status.apps.filter((a) => a.category === "terminable").map((a) => a.name)));
  };

  const optimize = async () => {
    if (selected.size === 0) return;
    setOptimizing(true);
    try {
      const r = await fetch(`${apiBase()}/api/admin/memory/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: Array.from(selected) }),
      });
      const d = await r.json();
      setResult(d);
      // 5초 후 자동 새로고침으로 갱신된 상태 반영
      setTimeout(refresh, 1500);
    } catch (e) {
      setResult({ ok: false, killed: [], skipped: [], freed_mb: 0 } as OptimizeResp);
    } finally {
      setOptimizing(false);
    }
  };

  const sys = status?.system;
  const usedPct = sys ? Math.round((sys.used_mb / sys.total_mb) * 100) : 0;
  const totalSelectedMb = status
    ? status.apps.filter((a) => selected.has(a.name)).reduce((s, a) => s + a.rss_mb, 0)
    : 0;

  return (
    <Modal open={open} onClose={onClose} title="🧹 메모리 최적화" subtitle="외부 앱 graceful 종료 — 우리 시스템은 보호" widthClass="max-w-2xl">
      <div className="p-5 space-y-4">
        {/* 시스템 메모리 요약 */}
        {sys && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] text-gray-400">현재 메모리</div>
              <div className="text-[14px] font-bold font-mono">
                <span className={usedPct > 90 ? "text-red-300" : usedPct > 75 ? "text-amber-300" : "text-sky-200"}>
                  {Math.round(sys.used_mb / 1024 * 10) / 10}GB
                </span>
                <span className="text-gray-500 mx-1">/</span>
                <span className="text-gray-400">{Math.round(sys.total_mb / 1024 * 10) / 10}GB</span>
                <span className={`ml-2 ${usedPct > 90 ? "text-red-300" : usedPct > 75 ? "text-amber-300" : "text-sky-200"}`}>
                  {usedPct}%
                </span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  usedPct > 90 ? "bg-gradient-to-r from-red-500 to-red-400" :
                  usedPct > 75 ? "bg-gradient-to-r from-amber-500 to-amber-400" :
                  "bg-gradient-to-r from-sky-500 to-cyan-400"
                }`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {sys.swap_used_mb > 100 && (
              <div className="text-[10px] text-amber-300 mt-1.5">
                ⚠️ 스왑 {sys.swap_used_mb}MB 사용 중 — RAM 부족
              </div>
            )}
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3">
            <div className="text-[13px] font-bold text-emerald-100">
              ✨ 정리 완료 — {result.freed_mb > 0 ? `${result.freed_mb}MB 회수` : "회수 측정 중..."}
            </div>
            {result.killed.length > 0 && (
              <div className="text-[11px] text-emerald-200/80 mt-1">
                종료: {result.killed.filter((k) => k.ok !== false).map((k) => k.name).join(", ")}
              </div>
            )}
            {result.skipped.length > 0 && (
              <div className="text-[11px] text-gray-400 mt-1">
                보호됨: {result.skipped.map((k) => k.name).join(", ")}
              </div>
            )}
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            onClick={recommendOnly}
            variant="outline"
            disabled={!status || optimizing}
            className="text-[12px]"
          >
            <Zap className="w-3.5 h-3.5 mr-1" />
            추천 자동 선택
          </Button>
          <Button
            onClick={toggleAll}
            variant="outline"
            disabled={!status || optimizing}
            className="text-[12px]"
          >
            전체 선택/해제
          </Button>
          <Button
            onClick={refresh}
            variant="outline"
            disabled={loading || optimizing}
            className="text-[12px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
          <div className="ml-auto text-[11px] text-gray-400">
            선택: <span className="text-sky-200 font-bold">{selected.size}개</span>
            {totalSelectedMb > 0 && (
              <span className="ml-1 font-mono">(~{Math.round(totalSelectedMb)}MB 예상 회수)</span>
            )}
          </div>
        </div>

        {/* 앱 리스트 */}
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 max-h-80 overflow-y-auto">
          {!status && (
            <div className="p-6 text-center text-[12px] text-gray-500">
              <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> 프로세스 스캔 중...
            </div>
          )}
          {status?.apps.map((a) => {
            const isProtected = a.category === "protected";
            const isTerm = a.category === "terminable";
            const isSel = selected.has(a.name);
            return (
              <button
                key={a.name}
                onClick={() => !isProtected && toggleOne(a.name)}
                disabled={isProtected}
                className={`w-full flex items-center gap-2 px-3 py-2 border-b border-gray-800/40 text-left text-[12px] transition-colors ${
                  isProtected
                    ? "cursor-not-allowed bg-gray-900/20 text-gray-600"
                    : isSel
                    ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-100"
                    : "hover:bg-gray-800/40 text-gray-200"
                }`}
              >
                {isProtected ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <span className={`w-3.5 h-3.5 rounded border ${isSel ? "bg-amber-500 border-amber-400" : "border-gray-600"} shrink-0 flex items-center justify-center text-[10px] text-white`}>
                    {isSel ? "✓" : ""}
                  </span>
                )}
                <span className="flex-1 truncate font-mono">{a.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  isProtected ? "bg-emerald-500/10 text-emerald-300" :
                  isTerm ? "bg-sky-500/10 text-sky-300" :
                  "bg-gray-700/30 text-gray-400"
                }`}>
                  {isProtected ? "보호" : isTerm ? "종료 가능" : "기타"}
                </span>
                <span className="font-mono text-gray-400 tabular-nums w-16 text-right">
                  {a.rss_mb >= 100 ? `${(a.rss_mb / 1024).toFixed(2)}G` : `${Math.round(a.rss_mb)}M`}
                </span>
              </button>
            );
          })}
        </div>

        {/* 안내 + 실행 */}
        <div className="text-[10px] text-gray-500 leading-relaxed">
          • <span className="text-emerald-400">보호</span>: 우리 시스템 (FastAPI/Ollama/Claude/터미널) — 절대 종료 안 됨<br />
          • <span className="text-sky-400">종료 가능</span>: Chrome/Whale/Steam 등 일반 앱 (graceful quit, 작업 저장됨)<br />
          • <span className="text-gray-400">기타</span>: 미분류 — 종료 시 영향 확인 필요
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-800/60">
          <Button variant="ghost" onClick={onClose} disabled={optimizing}>닫기</Button>
          <Button
            onClick={optimize}
            disabled={selected.size === 0 || optimizing}
            variant="destructive"
          >
            {optimizing ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />종료 중...</>
            ) : (
              <><Trash2 className="w-3.5 h-3.5 mr-1.5" />선택 {selected.size}개 종료</>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
