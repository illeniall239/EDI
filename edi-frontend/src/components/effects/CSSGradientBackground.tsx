'use client';

import { cn } from '@/utils/cn';

interface CSSGradientBackgroundProps {
  className?: string;
  variant?: 'mesh' | 'radial' | 'linear';
  animate?: boolean;
}

export function CSSGradientBackground({
  className,
  variant = 'mesh',
  animate = true,
}: CSSGradientBackgroundProps) {
  const gradientClass = variant === 'mesh' ? 'mesh-gradient' : '';

  return (
    <div
      className={cn(
        'absolute inset-0 -z-10',
        animate && gradientClass,
        'noise-texture',
        className
      )}
      style={
        variant === 'radial'
          ? {
              background:
                'radial-gradient(circle at 50% 50%, #333333 0%, #1a1a1a 25%, #000000 70%)',
            }
          : variant === 'linear'
          ? {
              background:
                'linear-gradient(180deg, #0a0a0a 0%, #2b2b2b 50%, #000000 100%)',
            }
          : undefined
      }
    />
  );
}
