'use client';

import React from 'react';

type ArabicTextSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl';

interface ArabicTextProps {
  children: React.ReactNode;
  size?: ArabicTextSize;
  className?: string;
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3';
}

const sizeClasses: Record<ArabicTextSize, string> = {
  sm: 'arabic-text-sm',
  base: 'arabic-text-base',
  lg: 'arabic-text-lg',
  xl: 'arabic-text-xl',
  '2xl': 'arabic-text-2xl',
};

export default function ArabicText({
  children,
  size = 'base',
  className = '',
  as: Tag = 'p',
}: ArabicTextProps) {
  return (
    <Tag
      dir="rtl"
      lang="ar"
      className={`arabic-text font-arabic ${sizeClasses[size]} ${className}`}
    >
      <bdi>{children}</bdi>
    </Tag>
  );
}
