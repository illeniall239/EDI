'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check } from 'lucide-react';

interface AnimatedSpreadsheetProps {
  isActive?: boolean;
}

type AnimationStep = 'ide' | 'select' | 'suggest' | 'typing' | 'done';

export default function AnimatedSpreadsheet({ isActive = true }: AnimatedSpreadsheetProps) {
  const [step, setStep] = useState<AnimationStep>('ide');

  useEffect(() => {
    if (!isActive) {
      setStep('ide');
      return;
    }

    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const runSequence = async () => {
      while (isMounted) {
        setStep('ide');
        await new Promise((r) => (timeoutId = setTimeout(r, 500)));
        if (!isMounted) break;

        setStep('select');
        await new Promise((r) => (timeoutId = setTimeout(r, 800)));
        if (!isMounted) break;

        setStep('suggest');
        await new Promise((r) => (timeoutId = setTimeout(r, 1200)));
        if (!isMounted) break;

        setStep('typing');
        await new Promise((r) => (timeoutId = setTimeout(r, 1000)));
        if (!isMounted) break;

        setStep('done');
        await new Promise((r) => (timeoutId = setTimeout(r, 3000)));
      }
    };

    runSequence();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isActive]);

  const cells = [
    { val: 'Item', header: true }, { val: 'Q1', header: true }, { val: 'Q2', header: true }, { val: 'Total', header: true },
    { val: 'Laptop', header: false }, { val: '$1200', header: false }, { val: '$1500', header: false }, { val: '', header: false, id: 'target' },
    { val: 'Mouse', header: false }, { val: '$40', header: false }, { val: '$55', header: false }, { val: '$95', header: false },
  ];

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      <div className="grid grid-cols-4 gap-1 w-full max-w-[320px] bg-[#0F0F12] p-2 rounded-lg border border-white/10 shadow-xl">
        {cells.map((cell, i) => {
          const isTarget = cell.id === 'target';
          const isSelected = isTarget && step !== 'ide';

          return (
            <div key={i} className="relative aspect-[2/1]">
              <motion.div
                className={`w-full h-full flex items-center justify-center rounded text-[10px]
                  ${cell.header ? 'bg-[#1A1A1E] font-semibold text-gray-400' : 'bg-[#252529] text-white/90 font-mono'}
                  ${isSelected ? 'ring-1 ring-neon-cyan/50 bg-[#1A1A1E]' : ''}
                `}
                animate={{
                  backgroundColor: isSelected ? '#1A1A1E' : cell.header ? '#1A1A1E' : '#252529'
                }}
              >
                {isTarget ? (
                  <span className="text-neon-cyan font-bold">
                    {step === 'typing' ? (
                      <span className="animate-pulse">=SUM..</span>
                    ) : step === 'done' ? (
                      '$2700'
                    ) : (
                      ''
                    )}
                  </span>
                ) : (
                  cell.val
                )}
              </motion.div>

              {/* AI Suggestion */}
              <AnimatePresence>
                {isTarget && step === 'suggest' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="absolute -top-6 left-1/2 -translate-x-1/2 bg-electric-purple text-white text-[8px] px-2 py-1 rounded-full whitespace-nowrap z-20 flex items-center gap-1 shadow-lg"
                  >
                    <Sparkles className="w-2 h-2" />
                    <span>=SUM(B2:C2)</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success Check */}
              <AnimatePresence>
                {isTarget && step === 'done' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -top-1 -right-1 bg-neon-cyan text-black w-4 h-4 rounded-full flex items-center justify-center z-20"
                  >
                    <Check className="w-2.5 h-2.5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
