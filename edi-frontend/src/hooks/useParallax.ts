'use client';

import { useState, useEffect, useRef, RefObject } from 'react';

interface ParallaxOptions {
  speed?: number; // Multiplier for parallax effect (0-1 for slower, >1 for faster)
  direction?: 'vertical' | 'horizontal';
}

export function useParallax<T extends HTMLElement>(
  options: ParallaxOptions = {}
): [RefObject<T | null>, number] {
  const { speed = 0.5, direction = 'vertical' } = options;
  const elementRef = useRef<T | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!elementRef.current) return;

      const rect = elementRef.current.getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const distance = elementCenter - viewportCenter;

      // Calculate parallax offset based on direction
      const parallaxOffset = distance * speed;
      setOffset(parallaxOffset);
    };

    // Initial calculation
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [speed, direction]);

  return [elementRef, offset];
}
