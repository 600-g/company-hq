'use client';

import { CheckCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DownloadModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center text-center p-10 rounded-[20px] w-[400px] max-w-[90vw]"
        style={{
          background: '#FFFFFF',
          boxShadow: '0 24px 80px rgba(0,0,0,0.20)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
          style={{ background: '#E8FBF3' }}
        >
          <CheckCircleIcon size={36} style={{ color: '#34C98E' }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: '#1A1A2E' }}>
          다운로드 완료!
        </h2>
        <p className="text-sm mb-2" style={{ color: '#6B7280' }}>
          1080×1080 PNG 파일이 저장되었습니다.
        </p>
        <p className="text-sm mb-8" style={{ color: '#6B7280' }}>
          인스타그램 앱에서 갤러리를 열어 피드에 업로드하세요.
        </p>
        <Button
          className="w-full h-12 text-base font-semibold rounded-[12px]"
          style={{ background: '#F26B5B', color: '#FFFFFF' }}
          onClick={onClose}
        >
          완료
        </Button>
      </div>
    </div>
  );
}
