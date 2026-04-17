'use client';

import { useRef, useEffect, useState } from 'react';
import { FeedState } from '@/types/insta-feed';
import { renderPreview } from '../utils/templateRenderer';

interface Props {
  state: FeedState;
  previewSize: number;
  isRendering: boolean;
}

export default function CanvasPreview({ state, previewSize, isRendering }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state.selectedTemplate) return;
    renderPreview(canvas, state, previewSize).catch(() => {});
  }, [state, previewSize]);

  return (
    <div className="relative" style={{ width: previewSize, height: previewSize }}>
      <canvas
        ref={canvasRef}
        width={previewSize}
        height={previewSize}
        className="block rounded-[8px]"
        style={{
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          width: previewSize,
          height: previewSize,
        }}
      />
      {isRendering && (
        <div
          className="absolute inset-0 rounded-[8px] flex items-center justify-center"
          style={{ background: 'rgba(26,26,46,0.5)' }}
        >
          <div
            className="w-10 h-10 rounded-full border-4 animate-spin"
            style={{ borderColor: '#7C5CBF', borderTopColor: 'transparent' }}
          />
        </div>
      )}
      {!state.selectedTemplate && (
        <div
          className="absolute inset-0 rounded-[8px] flex flex-col items-center justify-center gap-3"
          style={{ background: '#F0F0F5' }}
        >
          <div className="text-4xl">🖼️</div>
          <p className="text-sm font-medium" style={{ color: '#6B7280' }}>
            왼쪽에서 템플릿을 선택하세요
          </p>
        </div>
      )}
    </div>
  );
}
