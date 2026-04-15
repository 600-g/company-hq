/**
 * 캐릭터 머리 위 말풍선 시스템 (TeamMaker bubbleStore.ts 패턴 + Phaser 통합).
 *
 * - "loading" : 작업 중 동안 계속 표시 (예: 에이전트가 응답 생성 중)
 * - "result"  : 결과 전달 후 6초 자동 소멸
 *
 * Phaser 씬에 직접 그리는 방식 — 각 팀의 캐릭터 좌표 위에 둥근 말풍선 + 텍스트.
 */

import type { Scene } from "phaser";

export type BubbleVariant = "loading" | "result" | "info" | "tool";

/** 도구명 → 이모지 매핑 (Claude CLI 내장 도구) */
export const TOOL_EMOJI: Record<string, string> = {
  Read: "📖",
  Write: "✍️",
  Edit: "✏️",
  MultiEdit: "✏️",
  Bash: "💻",
  Glob: "🔍",
  LS: "📂",
  Grep: "🔎",
  WebFetch: "🌐",
  WebSearch: "🔍",
  Task: "🤝",
  TodoWrite: "📝",
};

export function toolToEmoji(toolName: string): string {
  return TOOL_EMOJI[toolName] ?? "⚙️";
}

export interface BubbleOpts {
  teamId: string;
  text: string;
  variant?: BubbleVariant;
  durationMs?: number; // result/info default 6000
}

interface Live {
  id: string;
  teamId: string;
  variant: BubbleVariant;
  bg: Phaser.GameObjects.Graphics;
  txt: Phaser.GameObjects.Text;
  followFn: () => void;
  expireAt: number | null;
}

const RESULT_DURATION = 6000;
const FONT = "Pretendard Variable, system-ui, sans-serif";

export class BubbleManager {
  private bubbles = new Map<string, Live>();
  private uid = 0;
  private updateLoopBound = false;

  constructor(
    private scene: Scene,
    private getTeamAnchor: (teamId: string) => { x: number; y: number } | null,
  ) {}

  /** 새 말풍선 추가. 같은 팀의 같은 variant 가 있으면 텍스트만 갱신. */
  add(opts: BubbleOpts): string {
    const variant = opts.variant ?? "result";

    // 같은 팀 + 같은 variant 는 갱신
    for (const live of this.bubbles.values()) {
      if (live.teamId === opts.teamId && live.variant === variant) {
        this.setText(live.id, opts.text);
        if (variant !== "loading") {
          live.expireAt = Date.now() + (opts.durationMs ?? RESULT_DURATION);
        }
        return live.id;
      }
    }

    const id = `bubble_${++this.uid}`;
    const anchor = this.getTeamAnchor(opts.teamId) ?? { x: 0, y: 0 };

    const txt = this.scene.add
      .text(anchor.x, anchor.y - 28, opts.text, {
        fontFamily: FONT,
        fontSize: "10px",
        color: variant === "loading" ? "#fbbf24" : "#e5e7eb",
        resolution: 4,
        align: "center",
        wordWrap: { width: 120 },
      })
      .setOrigin(0.5, 1)
      .setDepth(200);

    const bg = this.scene.add.graphics().setDepth(199);
    this.drawBg(bg, txt, variant);

    // 부드러운 fade-in
    txt.setAlpha(0);
    bg.setAlpha(0);
    this.scene.tweens.add({
      targets: [txt, bg],
      alpha: 1,
      duration: 180,
      ease: "Sine.easeOut",
    });

    const followFn = () => {
      const a = this.getTeamAnchor(opts.teamId);
      if (!a) return;
      txt.setPosition(a.x, a.y - 28);
      this.drawBg(bg, txt, variant);
    };

    const live: Live = {
      id,
      teamId: opts.teamId,
      variant,
      bg,
      txt,
      followFn,
      expireAt: variant === "loading" ? null : Date.now() + (opts.durationMs ?? RESULT_DURATION),
    };
    this.bubbles.set(id, live);

    if (!this.updateLoopBound) {
      this.scene.events.on("update", this.tick, this);
      this.updateLoopBound = true;
    }

    return id;
  }

  setText(id: string, text: string) {
    const b = this.bubbles.get(id);
    if (!b) return;
    b.txt.setText(text);
    this.drawBg(b.bg, b.txt, b.variant);
  }

  remove(id: string) {
    const b = this.bubbles.get(id);
    if (!b) return;
    this.scene.tweens.add({
      targets: [b.txt, b.bg],
      alpha: 0,
      duration: 160,
      onComplete: () => {
        b.txt.destroy();
        b.bg.destroy();
        this.bubbles.delete(id);
      },
    });
  }

  removeForTeam(teamId: string, variant?: BubbleVariant) {
    for (const live of Array.from(this.bubbles.values())) {
      if (live.teamId !== teamId) continue;
      if (variant && live.variant !== variant) continue;
      this.remove(live.id);
    }
  }

  clearAll() {
    for (const id of Array.from(this.bubbles.keys())) {
      this.remove(id);
    }
  }

  destroy() {
    if (this.updateLoopBound) {
      this.scene.events.off("update", this.tick, this);
      this.updateLoopBound = false;
    }
    for (const b of this.bubbles.values()) {
      b.txt.destroy();
      b.bg.destroy();
    }
    this.bubbles.clear();
  }

  private tick = () => {
    const now = Date.now();
    for (const b of Array.from(this.bubbles.values())) {
      b.followFn();
      if (b.expireAt && b.expireAt <= now) {
        this.remove(b.id);
      }
    }
  };

  private drawBg(g: Phaser.GameObjects.Graphics, txt: Phaser.GameObjects.Text, variant: BubbleVariant) {
    const padX = 6;
    const padY = 3;
    const w = txt.width + padX * 2;
    const h = txt.height + padY * 2;
    const x = txt.x - w / 2;
    const y = txt.y - h;

    const fill =
      variant === "loading"
        ? 0x2a2a5a
        : variant === "result"
          ? 0x1a3320
          : 0x0f1f3a;
    const border =
      variant === "loading"
        ? 0xfbbf24
        : variant === "result"
          ? 0x50d070
          : 0x4a90d9;

    g.clear();
    g.fillStyle(fill, 0.92);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, border, 0.9);
    g.strokeRoundedRect(x, y, w, h, 4);

    // 꼬리 (아래 가운데)
    const tx = txt.x;
    const ty = y + h;
    g.fillStyle(fill, 0.92);
    g.beginPath();
    g.moveTo(tx - 4, ty);
    g.lineTo(tx + 4, ty);
    g.lineTo(tx, ty + 4);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, border, 0.9);
    g.beginPath();
    g.moveTo(tx - 4, ty);
    g.lineTo(tx, ty + 4);
    g.lineTo(tx + 4, ty);
    g.strokePath();
  }
}
