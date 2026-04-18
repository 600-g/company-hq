"use client";

import { useEffect, useRef } from "react";
import { useWeatherStore } from "@/components/Weather";
import { useAgentStore, type Agent } from "@/stores/agentStore";

interface Props {
  floor: number;
  agentCount: number;
}

/**
 * Phaser 오피스 씬.
 *  - 날씨/시간에 따른 하늘 그라디언트 (상단 통창)
 *  - 엠비언트 틴트는 상위 레이어에서 처리
 *  - 에이전트(이모지 + 이름) 드래그 가능 — 위치 저장
 *  - 픽셀 캐릭터 이식은 다음 단계 (장독대 섹션 8)
 */
export default function HubOffice({ floor, agentCount }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const sceneRef = useRef<unknown>(null);
  const skyTop = useWeatherStore((s) => s.skyTop);
  const skyBottom = useWeatherStore((s) => s.skyBottom);
  const tod = useWeatherStore((s) => s.tod);
  const label = useWeatherStore((s) => s.label);
  const agents = useAgentStore((s) => s.agents);
  const updateAgent = useAgentStore((s) => s.updateAgent);

  // 씬 최초 생성
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;
    (async () => {
      const Phaser = (await import("phaser")).default;

      class OfficeScene extends Phaser.Scene {
        skyGraphics!: Phaser.GameObjects.Graphics;
        agentGroup!: Phaser.GameObjects.Container[];
        headerText!: Phaser.GameObjects.Text;
        floorRef = floor;
        agents: Agent[] = [];

        constructor() { super("office"); }

        create() {
          const { width, height } = this.scale;
          // 바닥 그리드
          const g = this.add.graphics();
          g.lineStyle(1, 0x1a1a2e, 0.4);
          for (let x = 0; x < width; x += 32) g.lineBetween(x, 0, x, height);
          for (let y = 0; y < height; y += 32) g.lineBetween(0, y, width, y);

          // 하늘 (상단 통창)
          this.skyGraphics = this.add.graphics();
          this.redrawSky();

          // 헤더
          this.headerText = this.add.text(width / 2, 100, "", {
            fontSize: "14px", color: "#94a3b8",
            fontFamily: "Pretendard Variable, system-ui, sans-serif", resolution: 4,
          }).setOrigin(0.5);
          this.updateHeader();

          this.agentGroup = [];
          this.renderAgents();

          // 드롭 영역 (전체) — 에이전트 드래그 후 놓을 때 grid 스냅
          this.input.on("dragstart", (_: unknown, obj: Phaser.GameObjects.GameObject) => {
            (obj as Phaser.GameObjects.Container).setAlpha(0.85);
          });
          this.input.on("drag", (_: unknown, obj: Phaser.GameObjects.GameObject, dx: number, dy: number) => {
            const c = obj as Phaser.GameObjects.Container;
            c.setPosition(dx, dy);
          });
          this.input.on("dragend", (_: unknown, obj: Phaser.GameObjects.GameObject) => {
            const c = obj as Phaser.GameObjects.Container;
            c.setAlpha(1);
            // grid 스냅 (32px)
            const sx = Math.round(c.x / 32) * 32;
            const sy = Math.round(c.y / 32) * 32;
            c.setPosition(sx, sy);
            const agentId = c.getData("agentId") as string;
            if (agentId) updateAgent(agentId, { position: { x: sx, y: sy }, floor: this.floorRef });
          });
        }

        setAgents(list: Agent[], f: number) {
          this.agents = list;
          this.floorRef = f;
          this.renderAgents();
          this.updateHeader();
        }

        updateHeader() {
          if (!this.headerText) return;
          const n = this.agents.filter((a) => (a.floor ?? 1) === this.floorRef).length;
          this.headerText.setText(`🏢 ${this.floorRef}F · ${n}명 · ${tod.toUpperCase()} · ${label}`);
        }

        renderAgents() {
          if (!this.agentGroup) return;
          this.agentGroup.forEach((c) => c.destroy());
          this.agentGroup = [];

          const floorAgents = this.agents.filter((a) => (a.floor ?? 1) === this.floorRef);
          const defaultPos = (i: number) => ({
            x: 120 + (i % 8) * 96,
            y: 220 + Math.floor(i / 8) * 120,
          });

          floorAgents.forEach((a, i) => {
            const p = a.position || defaultPos(i);
            const container = this.add.container(p.x, p.y);
            container.setSize(64, 72);

            // 이모지 캐릭 본체
            const emojiText = this.add.text(0, -4, a.emoji, {
              fontSize: "40px", resolution: 4,
            }).setOrigin(0.5);
            container.add(emojiText);

            // 이름 라벨
            const name = this.add.text(0, 28, a.name, {
              fontSize: "11px", color: "#e2e8f0",
              fontFamily: "Pretendard Variable, system-ui, sans-serif", resolution: 4,
              fontStyle: "bold",
            }).setOrigin(0.5);
            const nameBg = this.add.graphics();
            const nameW = Math.min(name.width + 10, 120);
            nameBg.fillStyle(0x0b0b14, 0.72);
            nameBg.fillRoundedRect(-nameW / 2, 22, nameW, 16, 4);
            container.add(nameBg);
            container.add(name);

            // 상태 점
            const statusColor = a.status === "working" ? 0xfbbf24
              : a.status === "error" ? 0xef4444
              : a.status === "complete" ? 0x22c55e
              : 0x64748b;
            const dot = this.add.graphics();
            dot.fillStyle(statusColor, 1);
            dot.fillCircle(18, -18, 3.5);
            container.add(dot);

            container.setInteractive(new Phaser.Geom.Rectangle(-32, -36, 64, 72), Phaser.Geom.Rectangle.Contains);
            this.input.setDraggable(container);
            container.setData("agentId", a.id);

            this.agentGroup.push(container);
          });
        }

        redrawSky() {
          const { width } = this.scale;
          const top = parseInt(skyTop.slice(1), 16);
          const bot = parseInt(skyBottom.slice(1), 16);
          this.skyGraphics.clear();
          const H = 90;
          for (let i = 0; i < H; i++) {
            const t = i / H;
            const r = Math.round(((top >> 16) & 255) * (1 - t) + ((bot >> 16) & 255) * t);
            const gn = Math.round(((top >> 8) & 255) * (1 - t) + ((bot >> 8) & 255) * t);
            const b = Math.round((top & 255) * (1 - t) + (bot & 255) * t);
            this.skyGraphics.fillStyle((r << 16) | (gn << 8) | b, 1);
            this.skyGraphics.fillRect(0, i, width, 1);
          }
        }
      }

      if (destroyed || !containerRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const game = new Phaser.Game({
        type: Phaser.AUTO, parent: containerRef.current,
        width: 1280, height: 800,
        backgroundColor: "transparent",
        pixelArt: false, antialias: true,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          zoom: dpr,
        },
        scene: [OfficeScene],
      });
      gameRef.current = game;
      // 씬 참조 저장 — 후속 업데이트 때 씬 재생성 없이 setAgents 호출
      game.events.once("ready", () => {
        sceneRef.current = game.scene.getScene("office");
      });
    })();
    return () => {
      destroyed = true;
      const g = gameRef.current as { destroy?: (b: boolean) => void } | null;
      g?.destroy?.(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // agents / floor 변경 시 씬에 반영 (씬 재생성 X)
  useEffect(() => {
    const s = sceneRef.current as {
      setAgents?: (list: Agent[], f: number) => void;
    } | null;
    s?.setAgents?.(agents, floor);
  }, [agents, floor]);

  // 날씨 변경 시 하늘 재그리기
  useEffect(() => {
    const s = sceneRef.current as { redrawSky?: () => void; updateHeader?: () => void } | null;
    s?.redrawSky?.();
    s?.updateHeader?.();
  }, [skyTop, skyBottom, tod, label]);

  // agentCount 는 상위 호환 위해 유지 (사용 안 해도 prop drilling)
  void agentCount;

  return <div ref={containerRef} className="w-full h-full" />;
}
