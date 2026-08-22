'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealProps {
  children: ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade';
  distance?: number;
  duration?: number;
  delay?: number;
  className?: string;
}

export function ScrollReveal({
  children,
  direction = 'up',
  distance = 100,
  duration = 1,
  delay = 0,
  className,
}: ScrollRevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;

    // Initial state based on direction
    const initialState: gsap.TweenVars = {
      opacity: 0,
    };

    switch (direction) {
      case 'up':
        initialState.y = distance;
        break;
      case 'down':
        initialState.y = -distance;
        break;
      case 'left':
        initialState.x = distance;
        break;
      case 'right':
        initialState.x = -distance;
        break;
      case 'fade':
        // Fade only, no movement
        break;
    }

    gsap.set(element, initialState);

    // Animate on scroll
    const animation = gsap.to(element, {
      opacity: 1,
      x: 0,
      y: 0,
      duration,
      delay,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: element,
        start: 'top 80%',
        toggleActions: 'play none none none',
      },
    });

    return () => {
      animation.kill();
      ScrollTrigger.getAll().forEach(trigger => {
        if (trigger.vars.trigger === element) {
          trigger.kill();
        }
      });
    };
  }, [direction, distance, duration, delay]);

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  );
}
