'use client';

import React from 'react';
import Image from 'next/image';

interface TextLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark' | 'gradient';
  className?: string;
}

export default function TextLogo({ size = 'md', className = '' }: TextLogoProps) {
  const sizeClasses = {
    sm: 'h-12',
    md: 'h-16',
    lg: 'h-20',
    xl: 'h-24'
  };

  return (
    <Image
      src="/1.svg"
      alt="EDI.ai"
      width={80}
      height={80}
      className={`w-auto ${sizeClasses[size]} ${className}`}
    />
  );
} 