'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { DownloadIcon, EyeIcon, RotateCcwIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeedState, TemplateId, TEMPLATES } from '@/types/insta-feed';
import StepIndicator from './StepIndicator';
import TemplateGallery from './TemplateGallery';
import CanvasPreview from './CanvasPreview';
import PropertyPanel from './PropertyPanel';
import Toast, { ToastMessage } from './Toast';
import DownloadModal from './DownloadModal';
import { renderExport } from '../utils/templateRenderer';

const INITIAL_STATE: FeedState = {
  selectedTemplate: null,
  imageFile: null,
  imageUrl: null,
  headline: '',
  subCopy: '',
  palette: 'mono-light',
  showLogo: true,
  logoText: '@brand',
  step: 1,
};

const PREVIEW_SIZE = 540;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function InstaFeedApp() {
  const [state, setState] = useState<FeedState>(INITIAL_STATE);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [zoom, setZoom] = useState(1);

  const debouncedState = useDebounce(state, 300);

  const addToast = useCallback((text: string, variant: ToastMessage['variant'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text, variant }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleStateChange = useCallback((partial: Partial<FeedState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleTemplateSelect = useCallback((id: TemplateId) => {
    const def = TEMPLATES.find((t) => t.id === id)!;
    setState((prev) => ({
      ...prev,
      selectedTemplate: id,
      palette: def.defaultPalette,
    }));
  }, []);

  const canProceedToStep2 = state.selectedTemplate !== null;
  const canProceedToStep3 = state.imageUrl !== null;

  const handleNextStep = useCallback(() => {
    if (state.step === 1) {
      if (!canProceedToStep2) {
        addToast('템플릿을 먼저 선택해주세요.', 'warning');
        return;
      }
      setState((prev) => ({ ...prev, step: 2 }));
    } else if (state.step === 2) {
      if (!canProceedToStep3) {
        addToast('이미지를 먼저 업로드해주세요.', 'warning');
        return;
      }
      setState((prev) => ({ ...prev, step: 3 }));
    } else if (state.step === 3) {
      setState((prev) => ({ ...prev, step: 4 }));
    }
  }, [state.step, canProceedToStep2, canProceedToStep3, addToast]);

  const handleDownload = useCallback(async () => {
    if (!state.selectedTemplate) return;
    if (!state.imageUrl) {
      addToast('이미지를 먼저 업로드해주세요.', 'warning');
      return;
    }

    setIsDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      await renderExport(canvas, state);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            addToast('다운로드에 실패했습니다.', 'warning');
            setIsDownloading(false);
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `insta-feed-${state.selectedTemplate}-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          setIsDownloading(false);
          setShowDownloadModal(true);
          addToast('다운로드 완료!', 'success');
        },
        'image/png'
      );
    } catch {
      addToast('렌더링 중 오류가 발생했습니다.', 'warning');
      setIsDownloading(false);
    }
  }, [state, addToast]);

  const handleReset = useCallback(() => {
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    setState(INITIAL_STATE);
    setZoom(1);
  }, [state.imageUrl]);

  const isPreviewStep = state.step === 3 || state.step === 4;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F7F7FB' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 flex-shrink-0"
        style={{ height: 60, background: '#1A1A2E' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">📸</span>
          <span className="text-white font-bold text-lg" style={{ fontFamily: 'Pretendard, sans-serif' }}>
            InstaFeed
          </span>
        </div>
        <StepIndicator currentStep={state.step} />
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-sm transition-opacity hover:opacity-80"
          style={{ color: '#9CA3AF', border: '1px solid #374151' }}
          aria-label="초기화"
        >
          <RotateCcwIcon size={14} />
          <span className="hidden sm:block">초기화</span>
        </button>
      </header>

      {/* Body */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left panel — template gallery */}
        <aside
          className="flex-shrink-0 overflow-y-auto p-4"
          style={{
            width: 280,
            background: '#FFFFFF',
            borderRight: '1px solid #E2E2EC',
            display: isPreviewStep ? 'none' : undefined,
          }}
        >
          <TemplateGallery
            selectedTemplate={state.selectedTemplate}
            onSelect={handleTemplateSelect}
          />
        </aside>

        {/* Center canvas */}
        <div
          className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto"
          style={{ minWidth: 0 }}
        >
          {isPreviewStep && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.1, 1.5))}
                className="w-9 h-9 rounded-[8px] flex items-center justify-center transition-colors hover:bg-gray-100"
                style={{ background: '#F7F7FB', border: '1px solid #E2E2EC' }}
                aria-label="확대"
              >
                <ZoomInIcon size={18} style={{ color: '#1A1A2E' }} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.1, 0.4))}
                className="w-9 h-9 rounded-[8px] flex items-center justify-center transition-colors hover:bg-gray-100"
                style={{ background: '#F7F7FB', border: '1px solid #E2E2EC' }}
                aria-label="축소"
              >
                <ZoomOutIcon size={18} style={{ color: '#1A1A2E' }} />
              </button>
            </div>
          )}
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <CanvasPreview
              state={debouncedState}
              previewSize={PREVIEW_SIZE}
              isRendering={false}
            />
          </div>
          {state.selectedTemplate && (
            <p className="mt-3 text-xs" style={{ color: '#6B7280' }}>
              미리보기 크기 540×540 · 다운로드 1080×1080
            </p>
          )}
        </div>

        {/* Right panel — properties */}
        <aside
          className="flex-shrink-0 overflow-y-auto p-4"
          style={{
            width: 280,
            background: '#FFFFFF',
            borderLeft: '1px solid #E2E2EC',
            display: isPreviewStep && state.step !== 4 ? 'none' : undefined,
          }}
        >
          <PropertyPanel state={state} onChange={handleStateChange} />
        </aside>
      </main>

      {/* Footer */}
      <footer
        className="flex items-center justify-between px-6 flex-shrink-0"
        style={{
          height: 64,
          background: '#FFFFFF',
          borderTop: '1px solid #E2E2EC',
        }}
      >
        <div className="flex items-center gap-2">
          {state.step > 1 && (
            <button
              onClick={() => setState((prev) => ({ ...prev, step: (prev.step - 1) as typeof prev.step }))}
              className="px-4 py-2 text-sm rounded-[8px] transition-opacity hover:opacity-80"
              style={{
                background: 'transparent',
                color: '#6B7280',
                border: '1px solid #E2E2EC',
              }}
            >
              이전
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {state.step < 3 && (
            <Button
              onClick={handleNextStep}
              disabled={state.step === 1 ? !canProceedToStep2 : !canProceedToStep3}
              className="flex items-center gap-2 px-6 h-11 text-sm font-semibold rounded-[10px] transition-all"
              style={{
                background: '#7C5CBF',
                color: '#FFFFFF',
                opacity: (state.step === 1 ? !canProceedToStep2 : !canProceedToStep3) ? 0.45 : 1,
                cursor: (state.step === 1 ? !canProceedToStep2 : !canProceedToStep3) ? 'not-allowed' : 'pointer',
              }}
            >
              {state.step === 2 ? (
                <>
                  <EyeIcon size={16} />
                  미리보기
                </>
              ) : (
                <>
                  다음
                  <ChevronRightIcon size={16} />
                </>
              )}
            </Button>
          )}

          {state.step >= 3 && (
            <Button
              onClick={handleDownload}
              disabled={isDownloading || !state.selectedTemplate}
              className="flex items-center gap-2 px-6 h-12 text-base font-semibold rounded-[12px] transition-all"
              style={{
                background: isDownloading ? '#E0563F' : '#F26B5B',
                color: '#FFFFFF',
                opacity: (!state.selectedTemplate || isDownloading) ? 0.45 : 1,
              }}
              aria-label="PNG 다운로드"
            >
              {isDownloading ? (
                <>
                  <div
                    className="w-4 h-4 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#FFFFFF' }}
                  />
                  생성 중...
                </>
              ) : (
                <>
                  <DownloadIcon size={18} />
                  PNG 다운로드
                </>
              )}
            </Button>
          )}
        </div>
      </footer>

      <Toast toasts={toasts} onRemove={removeToast} />
      <DownloadModal open={showDownloadModal} onClose={() => setShowDownloadModal(false)} />
    </div>
  );
}
