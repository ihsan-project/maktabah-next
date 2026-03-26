'use client';

import React from 'react';

function ShimmerBlock({ className }: { className?: string }) {
  return <div className={`shimmer rounded ${className ?? ''}`} />;
}

export default function SkeletonResultCard(): JSX.Element {
  return (
    <div className="card result-card" aria-hidden="true">
      {/* Header: source badge + reference + breadcrumb */}
      <div className="flex items-center gap-2 mb-3">
        <ShimmerBlock className="h-5 w-16 rounded-full" />
        <ShimmerBlock className="h-5 w-10" />
        <ShimmerBlock className="h-4 w-32" />
      </div>

      {/* English text lines */}
      <div className="space-y-2">
        <ShimmerBlock className="h-4 w-full" />
        <ShimmerBlock className="h-4 w-full" />
        <ShimmerBlock className="h-4 w-3/4" />
      </div>

      {/* Arabic text area */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="space-y-2" dir="rtl">
          <ShimmerBlock className="h-5 w-full" />
          <ShimmerBlock className="h-5 w-5/6 ml-auto" />
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
        <ShimmerBlock className="h-4 w-14" />
        <ShimmerBlock className="h-4 w-16" />
        <ShimmerBlock className="h-4 w-12" />
      </div>
    </div>
  );
}
