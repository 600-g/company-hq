import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'InstaFeed - 인스타그램 피드 제작기',
  description: '6가지 템플릿으로 1080×1080 인스타그램 피드를 손쉽게 제작하세요.',
};

export default function InstaFeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
