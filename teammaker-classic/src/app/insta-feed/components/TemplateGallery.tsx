'use client';

import { useRef, useEffect, useState } from 'react';
import { TEMPLATES, PALETTES, TemplateId, FeedState } from '@/types/insta-feed';
import { renderPreview } from '../utils/templateRenderer';

interface ThumbnailProps {
  templateId: TemplateId;
  isSelected: boolean;
  onClick: () => void;
}

function TemplateThumbnail({ templateId, isSelected, onClick }: ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const def = TEMPLATES.find((t) => t.id === templateId)!;
  const palette = PALETTES[def.defaultPalette];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mockState: FeedState = {
      selectedTemplate: templateId,
      imageFile: null,
      imageUrl: null,
      headline: def.name,
      subCopy: 'Sample Caption',
      palette: def.defaultPalette,
      showLogo: true,
      logoText: '@brand',
      step: 1,
    };
    renderPreview(canvas, mockState, 200).catch(() => {});
  }, [templateId, def]);

  return (
    <button
      onClick={onClick}
      className="relative flex-shrink-0 transition-all duration-180"
      style={{ borderRadius: 12 }}
      aria-label={`템플릿 선택: ${def.name}`}
    >
      <div
        className="overflow-hidden"
        style={{
          borderRadius: 12,
          border: isSelected ? '2px solid #7C5CBF' : '1px solid #E2E2EC',
          boxShadow: isSelected
            ? '0 0 0 4px rgba(124,92,191,0.15)'
            : 'none',
          transform: isSelected ? 'scale(1.02)' : 'scale(1)',
          transition: 'all 180ms ease-out',
        }}
      >
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          className="block w-full aspect-square"
          style={{ background: palette.background }}
        />
      </div>
      <div className="mt-2 px-1 text-left">
        <p className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>
          {def.name}
        </p>
        <p className="text-xs" style={{ color: '#6B7280' }}>
          {def.paletteName}
        </p>
      </div>
    </button>
  );
}

interface Props {
  selectedTemplate: TemplateId | null;
  onSelect: (id: TemplateId) => void;
}

export default function TemplateGallery({ selectedTemplate, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-semibold pb-3" style={{ color: '#1A1A2E', borderBottom: '1px solid #E2E2EC' }}>
        템플릿 선택
      </h2>
      <div
        className="grid gap-3 overflow-y-auto pr-1"
        style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
      >
        {TEMPLATES.map((t) => (
          <TemplateThumbnail
            key={t.id}
            templateId={t.id}
            isSelected={selectedTemplate === t.id}
            onClick={() => onSelect(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
