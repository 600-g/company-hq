'use client';

import { CheckIcon } from 'lucide-react';
import { AppStep } from '@/types/insta-feed';

const STEPS = ['템플릿 선택', '소스 입력', '미리보기', '다운로드'];

interface Props {
  currentStep: AppStep;
}

export default function StepIndicator({ currentStep }: Props) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const stepNum = (i + 1) as AppStep;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;

        return (
          <div key={stepNum} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{
                  background: isDone ? '#34C98E' : isActive ? '#7C5CBF' : '#6B7280',
                  color: '#FFFFFF',
                }}
              >
                {isDone ? <CheckIcon size={12} strokeWidth={2.5} /> : stepNum}
              </div>
              <span
                className="text-xs font-medium hidden sm:block"
                style={{ color: isActive ? '#FFFFFF' : isDone ? '#34C98E' : '#9CA3AF' }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="w-6 h-0.5 hidden sm:block"
                style={{ background: isDone ? '#34C98E' : '#4B5563' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
