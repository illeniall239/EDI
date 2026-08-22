'use client';

import { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface GlassmorphicCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'strong';
  hover?: boolean;
  glow?: boolean;
  glowColor?: 'default' | 'cyan' | 'magenta';
}

export function GlassmorphicCard({
  children,
  className,
  variant = 'default',
  hover = false,
  glow = false,
  glowColor = 'default',
}: GlassmorphicCardProps) {
  const glowClass = glow
    ? glowColor === 'cyan'
      ? 'glow-cyan'
      : glowColor === 'magenta'
      ? 'glow-magenta'
      : 'glow'
    : '';

  return (
    <div
      className={cn(
        variant === 'strong' ? 'glass-card-strong' : 'glass-card',
        'rounded-xl',
        hover && 'transition-all duration-300 hover:scale-[1.02]',
        glowClass,
        className
      )}
    >
      {children}
    </div>
  );
}
