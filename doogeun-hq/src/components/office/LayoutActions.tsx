"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Upload, RotateCcw, Trash2 } from "lucide-react";
import { useLayoutStore, type PlacedFurniture } from "@/stores/layoutStore";
import { useConfirm } from "@/components/Confirm";

interface Props {
  floor: number;
}

type Snapshot = Record<number, PlacedFurniture[]>;

/**
 * 편집 모드 도구 — Export/Import/Reset/Undo
 *  - Export: floors JSON 다운로드
 *  - Import: JSON 파일 업로드 → 덮어씌우기 (확인 후)
 *  - Reset: 현재 층 전부 삭제
 *  - Undo: 최근 배치 30개 스택 (Cmd+Z)
 */
export default function LayoutActions({ floor }: Props) {
  const floors = useLayoutStore((s) => s.floors);
  const clearFloor = useLayoutStore((s) => s.clearFloor);
  const confirm = useConfirm();
  const [flash, setFlash] = useState<string | null>(null);

  // 간이 undo — floors snapshot stack
  const stackRef = useRef<Snapshot[]>([]);
  const prevFloorsRef = useRef<Snapshot>(floors);

  useEffect(() => {
    // floors 가 바뀔 때마다 이전 상태를 스택에 저장
    const prev = prevFloorsRef.current;
    const now = floors;
    const totalPrev = Object.values(prev).reduce((a, b) => a + b.length, 0);
    const totalNow = Object.values(now).reduce((a, b) => a + b.length, 0);
    if (totalPrev !== totalNow) {
      stackRef.current.push(prev);
      if (stackRef.current.length > 30) stackRef.current.shift();
    }
    prevFloorsRef.current = now;
  }, [floors]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1500); };

  const undo = () => {
    const prev = stackRef.current.pop();
    if (!prev) { showFlash("되돌릴 기록 없음"); return; }
    useLayoutStore.setState({ floors: prev });
    showFlash("되돌렸음");
  };

  const exportJson = () => {
    const payload = { version: 1, floors, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `doogeun-hq-layout-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showFlash("Export 완료");
  };

  const importJson = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const next = parsed.floors as Snapshot;
        if (!next || typeof next !== "object") throw new Error("floors 필드 없음");
        const ok = await confirm({
          title: "레이아웃 덮어쓰기",
          message: `${Object.values(next).reduce((a, b) => a + (b?.length ?? 0), 0)}개 가구를 불러옵니다. 현재 배치가 사라져요.`,
          confirmText: "덮어쓰기",
          destructive: true,
        });
        if (!ok) return;
        stackRef.current.push(floors); // undo 가능하게
        useLayoutStore.setState({ floors: next });
        showFlash("Import 완료");
      } catch (e) {
        showFlash(`실패: ${e instanceof Error ? e.message : "파싱 오류"}`);
      }
    };
    input.click();
  };

  const reset = async () => {
    const ok = await confirm({
      title: `${floor}F 초기화`,
      message: `${floor}F 가구 전부 삭제합니다. 되돌리기(Cmd+Z)로 복구 가능.`,
      confirmText: "초기화",
      destructive: true,
    });
    if (!ok) return;
    clearFloor(floor);
    showFlash(`${floor}F 초기화`);
  };

  return (
    <div className="flex items-center gap-1 p-1.5 border-t border-gray-800/60 bg-gray-900/40">
      <button onClick={undo} title="되돌리기 (⌘Z)" className="p-1.5 text-gray-400 hover:text-sky-300 hover:bg-gray-800 rounded flex items-center gap-1 text-[10px]">
        <RotateCcw className="w-3 h-3" /> Undo
      </button>
      <button onClick={exportJson} title="JSON Export" className="p-1.5 text-gray-400 hover:text-sky-300 hover:bg-gray-800 rounded flex items-center gap-1 text-[10px]">
        <Download className="w-3 h-3" /> Export
      </button>
      <button onClick={importJson} title="JSON Import" className="p-1.5 text-gray-400 hover:text-sky-300 hover:bg-gray-800 rounded flex items-center gap-1 text-[10px]">
        <Upload className="w-3 h-3" /> Import
      </button>
      <button onClick={reset} title="현재 층 초기화" className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded flex items-center gap-1 text-[10px] ml-auto">
        <Trash2 className="w-3 h-3" /> {floor}F 리셋
      </button>
      {flash && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-14 px-2 py-1 rounded bg-sky-500/20 border border-sky-400/40 text-[10px] text-sky-200">
          {flash}
        </span>
      )}
    </div>
  );
}
