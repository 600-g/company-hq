'use client';

import { useRef, useState, useCallback } from 'react';
import { UploadIcon, XIcon, ImageIcon } from 'lucide-react';

interface Props {
  imageUrl: string | null;
  onImageChange: (file: File | null, url: string | null) => void;
}

export default function ImageUpload({ imageUrl, onImageChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) {
        onImageChange(null, null);
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        alert('JPG, PNG, WEBP 파일만 지원합니다.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('파일 크기는 10MB 이하여야 합니다.');
        return;
      }
      const url = URL.createObjectURL(file);
      onImageChange(file, url);
    },
    [onImageChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0] ?? null;
      handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onImageChange(null, null);
    },
    [onImageChange]
  );

  if (imageUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-[12px] cursor-pointer group"
        style={{ width: '100%', height: 160 }}
        onClick={() => inputRef.current?.click()}
      >
        <img src={imageUrl} alt="업로드된 이미지" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-sm font-medium">이미지 변경</span>
        </div>
        <button
          onClick={handleRemove}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
          aria-label="이미지 제거"
        >
          <XIcon size={12} style={{ color: '#1A1A2E' }} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-[12px] cursor-pointer transition-all"
      style={{
        width: '100%',
        height: 160,
        background: isDragOver ? '#EAF3FB' : '#F7F7FB',
        border: `1px dashed ${isDragOver ? '#2B7FE0' : '#B0B0C8'}`,
      }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label="이미지 업로드 영역"
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <UploadIcon size={32} style={{ color: '#6B7280' }} />
      <p className="text-xs text-center" style={{ color: '#6B7280' }}>
        클릭하거나 드래그해서 사진 추가
      </p>
      <p className="text-[11px]" style={{ color: '#F59E0B' }}>
        JPG · PNG · WEBP · 최대 10MB
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
