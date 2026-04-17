'use client';

import dynamic from 'next/dynamic';

const InstaFeedApp = dynamic(
  () => import('./InstaFeedApp'),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: '#F7F7FB' }}
      >
        <div
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: '#E2E2EC', borderTopColor: '#7C5CBF' }}
        />
      </div>
    ),
  }
);

export default function InstaFeedClientLoader() {
  return <InstaFeedApp />;
}
