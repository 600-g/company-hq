'use client';

import { useCallback, useState } from 'react';
import { FeedState, PALETTES, PaletteKey } from '@/types/insta-feed';
import ImageUpload from './ImageUpload';
import { Label } from '@/components/ui/label';

const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];
const PALETTE_LABELS: Record<PaletteKey, string> = {
  'mono-light': '라이트',
  'mono-dark': '다크',
  'warm-cream': '웜 크림',
  'ocean-blue': '오션 블루',
  'blush-pink': '블러시 핑크',
  forest: '포레스트',
};

const MAX_HEADLINE = 40;
const MAX_SUBCOPY = 80;

interface Props {
  state: FeedState;
  onChange: (partial: Partial<FeedState>) => void;
}

function Counter({ current, max }: { current: number; max: number }) {
  return (
    <span className="text-[11px]" style={{ color: '#6B7280' }}>
      {current}/{max}
    </span>
  );
}

export default function PropertyPanel({ state, onChange }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {/* Image upload */}
      <section>
        <h3 className="text-base font-semibold mb-3 pb-2" style={{ color: '#1A1A2E', borderBottom: '1px solid #E2E2EC' }}>
          이미지
        </h3>
        <ImageUpload
          imageUrl={state.imageUrl}
          onImageChange={(file, url) => onChange({ imageFile: file, imageUrl: url })}
        />
      </section>

      {/* Text inputs */}
      <section>
        <h3 className="text-base font-semibold mb-3 pb-2" style={{ color: '#1A1A2E', borderBottom: '1px solid #E2E2EC' }}>
          텍스트
        </h3>
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <Label className="text-xs font-medium" style={{ color: '#1A1A2E' }}>헤드라인</Label>
              <Counter current={state.headline.length} max={MAX_HEADLINE} />
            </div>
            <input
              type="text"
              value={state.headline}
              maxLength={MAX_HEADLINE}
              placeholder="주요 문구를 입력하세요"
              className="w-full h-10 px-3 text-sm rounded-[8px] outline-none transition-all"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E2EC',
                color: '#1A1A2E',
                fontFamily: 'Pretendard, sans-serif',
              }}
              onChange={(e) => onChange({ headline: e.target.value })}
              onFocus={(e) => {
                e.target.style.borderColor = '#7C5CBF';
                e.target.style.boxShadow = '0 0 0 3px rgba(124,92,191,0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#E2E2EC';
                e.target.style.boxShadow = 'none';
              }}
              aria-label="헤드라인 텍스트"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <Label className="text-xs font-medium" style={{ color: '#1A1A2E' }}>서브 카피</Label>
              <Counter current={state.subCopy.length} max={MAX_SUBCOPY} />
            </div>
            <textarea
              value={state.subCopy}
              maxLength={MAX_SUBCOPY}
              placeholder="보조 설명을 입력하세요"
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-[8px] resize-none outline-none transition-all"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E2EC',
                color: '#1A1A2E',
                fontFamily: 'Pretendard, sans-serif',
                height: 80,
              }}
              onChange={(e) => onChange({ subCopy: e.target.value })}
              onFocus={(e) => {
                e.target.style.borderColor = '#7C5CBF';
                e.target.style.boxShadow = '0 0 0 3px rgba(124,92,191,0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#E2E2EC';
                e.target.style.boxShadow = 'none';
              }}
              aria-label="서브 카피 텍스트"
            />
          </div>
        </div>
      </section>

      {/* Palette */}
      <section>
        <h3 className="text-base font-semibold mb-3 pb-2" style={{ color: '#1A1A2E', borderBottom: '1px solid #E2E2EC' }}>
          브랜드 컬러
        </h3>
        <div className="flex flex-wrap gap-2">
          {PALETTE_KEYS.map((key) => {
            const p = PALETTES[key];
            const isSelected = state.palette === key;
            return (
              <button
                key={key}
                onClick={() => onChange({ palette: key })}
                title={PALETTE_LABELS[key]}
                className="w-7 h-7 rounded-full transition-all flex-shrink-0"
                style={{
                  background: p.accent,
                  border: isSelected ? '3px solid #7C5CBF' : '2px solid #E2E2EC',
                  boxShadow: isSelected ? '0 0 0 2px rgba(124,92,191,0.3)' : 'none',
                  transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                }}
                aria-label={`컬러 팔레트: ${PALETTE_LABELS[key]}`}
                aria-pressed={isSelected}
              />
            );
          })}
        </div>
      </section>

      {/* Logo toggle */}
      <section>
        <h3 className="text-base font-semibold mb-3 pb-2" style={{ color: '#1A1A2E', borderBottom: '1px solid #E2E2EC' }}>
          브랜드 로고
        </h3>
        <div className="flex items-center gap-3 mb-3">
          <button
            role="switch"
            aria-checked={state.showLogo}
            onClick={() => onChange({ showLogo: !state.showLogo })}
            className="w-10 h-6 rounded-full transition-all flex-shrink-0 relative"
            style={{
              background: state.showLogo ? '#7C5CBF' : '#E2E2EC',
            }}
            aria-label="로고 워터마크 토글"
          >
            <span
              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
              style={{ left: state.showLogo ? 22 : 2 }}
            />
          </button>
          <span className="text-sm" style={{ color: '#1A1A2E' }}>
            워터마크 표시
          </span>
        </div>
        {state.showLogo && (
          <input
            type="text"
            value={state.logoText}
            placeholder="@브랜드명"
            maxLength={30}
            className="w-full h-10 px-3 text-sm rounded-[8px] outline-none transition-all"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E2EC',
              color: '#1A1A2E',
              fontFamily: 'Pretendard, sans-serif',
            }}
            onChange={(e) => onChange({ logoText: e.target.value })}
            onFocus={(e) => {
              e.target.style.borderColor = '#7C5CBF';
              e.target.style.boxShadow = '0 0 0 3px rgba(124,92,191,0.12)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E2E2EC';
              e.target.style.boxShadow = 'none';
            }}
            aria-label="로고 텍스트"
          />
        )}
      </section>
    </div>
  );
}
