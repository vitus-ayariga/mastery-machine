"use client";

import dynamic from 'next/dynamic';

const FlashcardApp = dynamic(() => import('@/components/FlashcardApp'), { ssr: false });

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <FlashcardApp />
    </main>
  );
}
