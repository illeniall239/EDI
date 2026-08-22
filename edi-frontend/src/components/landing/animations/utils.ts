import { useState, useEffect, useRef } from 'react';

/**
 * Hook for creating typing effect animation
 * @param text - The full text to display
 * @param speed - Typing speed in milliseconds per character
 * @param startDelay - Delay before starting to type
 * @returns Current displayed text
 */
export function useTypingEffect(text: string, speed: number = 50, startDelay: number = 0): string {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');

    const startTimer = setTimeout(() => {
      const interval = setInterval(() => {
        setDisplayedText((prev) => {
          const nextLength = prev.length + 1;
          if (nextLength > text.length) {
            clearInterval(interval);
            return prev;
          }
          return text.slice(0, nextLength);
        });
      }, speed);

      return () => clearInterval(interval);
    }, startDelay);

    return () => clearTimeout(startTimer);
  }, [text, speed, startDelay]);

  return displayedText;
}

/**
 * Hook for counting up to a number with easing
 * @param end - Target number
 * @param duration - Animation duration in milliseconds
 * @param startDelay - Delay before starting to count
 * @returns Current count value
 */
export function useCountUp(end: number, duration: number = 1000, startDelay: number = 0): number {
  const [count, setCount] = useState(0);
  const frameRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setCount(0);

    const startTimer = setTimeout(() => {
      const animate = (currentTime: number) => {
        if (!startTimeRef.current) {
          startTimeRef.current = currentTime;
        }

        const elapsed = currentTime - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        setCount(Math.floor(easeProgress * end));

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        }
      };

      frameRef.current = requestAnimationFrame(animate);
    }, startDelay);

    return () => {
      clearTimeout(startTimer);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      startTimeRef.current = undefined;
    };
  }, [end, duration, startDelay]);

  return count;
}

/**
 * Hook for creating looped animations
 * @param callback - Function to call on each loop
 * @param interval - Time between loops in milliseconds
 * @param startImmediately - Whether to call callback immediately
 */
export function useAnimationLoop(
  callback: () => void,
  interval: number,
  startImmediately: boolean = true
): void {
  const savedCallback = useRef(callback);
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (startImmediately) {
      savedCallback.current();
    }

    intervalRef.current = setInterval(() => {
      savedCallback.current();
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [interval, startImmediately]);
}

/**
 * Hook for cycling through array items
 * @param items - Array of items to cycle through
 * @param interval - Time between cycles in milliseconds
 * @returns Current item index and item
 */
export function useCycle<T>(items: T[], interval: number): { index: number; item: T } {
  const [index, setIndex] = useState(0);

  useAnimationLoop(() => {
    setIndex((prev) => (prev + 1) % items.length);
  }, interval);

  return { index, item: items[index] };
}

/**
 * Hook for delayed visibility state
 * @param delay - Delay in milliseconds before becoming visible
 * @returns visibility state
 */
export function useDelayedVisibility(delay: number): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => {
      clearTimeout(timer);
      setIsVisible(false);
    };
  }, [delay]);

  return isVisible;
}

/**
 * Easing functions for animations
 */
export const easing = {
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOut: (t: number) => t * (2 - t),
  easeIn: (t: number) => t * t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

/**
 * Format number with commas for display
 */
export function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
