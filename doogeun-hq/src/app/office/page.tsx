"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/stores/agentStore";

const FLOORS = [1, 2, 3];

export default function OfficePage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const [floor, setFloor] = useState(1);
  const [loading, setLoading] = useState(true);
  const agents = useAgentStore((s) => s.agents);

  useEffect(() => {
    if (!canvasRef.current || gameRef.current) return;
    let destroyed = false;
    (async () => {
      const Phaser = (await import("phaser")).default;

      class BlankScene extends Phaser.Scene {
        constructor() { super("blank"); }
        create() {
          const { width, height } = this.scale;
          // 바닥 그리드
          const g = this.add.graphics();
          g.lineStyle(1, 0x1a1a2e, 1);
          for (let x = 0; x < width; x += 32) g.lineBetween(x, 0, x, height);
          for (let y = 0; y < height; y += 32) g.lineBetween(0, y, width, y);
          // 중앙 텍스트
          this.add.text(width / 2, height / 2 - 10, "🏢 오피스 — 층 " + floor, {
            fontSize: "18px", color: "#fbbf24",
            fontFamily: "Pretendard Variable, system-ui, sans-serif",
            resolution: 4,
          }).setOrigin(0.5);
          this.add.text(width / 2, height / 2 + 16, "픽셀 캐릭터 이식 예정 · 에이전트 " + agents.length + "명 등록됨", {
            fontSize: "12px", color: "#6b7280",
            fontFamily: "Pretendard Variable, system-ui, sans-serif",
            resolution: 4,
          }).setOrigin(0.5);
        }
      }

      if (destroyed || !canvasRef.current) return;
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: canvasRef.current,
        width: 960,
        height: 540,
        backgroundColor: "transparent",
        pixelArt: false,
        antialias: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [BlankScene],
      });
      gameRef.current = game;
      setLoading(false);
    })();

    return () => {
      destroyed = true;
      const g = gameRef.current as { destroy?: (removeCanvas: boolean) => void } | null;
      g?.destroy?.(true);
      gameRef.current = null;
    };
  }, [floor, agents.length]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="두근컴퍼니 HQ — 오피스" />
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>오피스 — Phaser 픽셀 씬</CardTitle>
              <CardDescription>층별 에이전트 배치 (구버전 OfficeScene 이식 예정)</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              {FLOORS.map((f) => (
                <Button
                  key={f}
                  variant={floor === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFloor(f)}
                >
                  {f}F
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div
              ref={canvasRef}
              className="w-full aspect-video max-h-[540px] border border-gray-800 rounded-lg bg-[#06060e] overflow-hidden"
            />
            {loading && <div className="mt-2 text-[11px] text-gray-500">Phaser 로딩...</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>등록된 에이전트</CardTitle>
            <CardDescription>오피스에 배치할 에이전트 목록</CardDescription>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <div className="py-4 text-[12px] text-gray-500 text-center">
                아직 에이전트 없음. 다음 세션에 에이전트 생성 모달 추가 예정.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {agents.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg border border-gray-800/60 bg-gray-900/30 flex items-center gap-3">
                    <div className="text-2xl">{a.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-gray-200 font-bold truncate">{a.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{a.role}</div>
                    </div>
                    <Badge variant="secondary">{a.floor}F · {a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
