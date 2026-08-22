'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, Check } from 'lucide-react';

interface AnimatedCollaborationProps {
  isActive?: boolean;
}

type AnimationStep = 'ide' | 'active' | 'save';

export default function AnimatedCollaboration({ isActive = true }: AnimatedCollaborationProps) {
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

        setStep('active');
        await new Promise((r) => (timeoutId = setTimeout(r, 2000)));
        if (!isMounted) break;

        setStep('save');
        await new Promise((r) => (timeoutId = setTimeout(r, 2000)));
      }
    };

    runSequence();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isActive]);

  const cursors = [
    {
      id: 1,
      name: 'Sarah',
      color: '#ffffff',
      start: { top: '80%', left: '80%' },
      end: { top: '30%', left: '40%' }
    },
    {
      id: 2,
      name: 'Mike',
      color: '#8a8a8a',
      start: { top: '10%', left: '90%' },
      end: { top: '60%', left: '70%' }
    },
  ];

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6">

      {/* Toast */}
      <AnimatePresence>
        {step !== 'ide' && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute top-4 right-4 glass-card-strong px-2 py-1 rounded-full flex items-center gap-2 z-20"
          >
            <div className="flex -space-x-1">
              {cursors.map((c) => (
                <div key={c.id} className="w-4 h-4 rounded-full border border-black" style={{ backgroundColor: c.color }} />
              ))}
            </div>
            <span className="text-[10px] text-gray-300">2 users active</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      <div className="w-full max-w-[300px] bg-black/40 border border-white/5 rounded-lg p-2 grid grid-cols-2 gap-1 relative z-10">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-white/5 rounded border border-transparent relative overflow-hidden group">
            {step === 'save' && (i === 1 || i === 4) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-neon-cyan/5 border border-neon-cyan/30"
              />
            )}
            {step === 'save' && (i === 1 || i === 4) && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-1 right-1 w-3 h-3 bg-neon-cyan rounded-full flex items-center justify-center shadow-lg"
              >
                <Check className="w-2 h-2 text-black" />
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {/* Cursors Layer */}
      <div className="absolute inset-0 pointer-events-none z-30">
        {step !== 'ide' && cursors.map((c) => (
          <motion.div
            key={c.id}
            className="absolute"
            initial={c.start}
            animate={c.end}
            transition={{ duration: 1, type: "spring", stiffness: 50 }}
          >
            <MousePointer2 className="w-5 h-5 drop-shadow-lg" fill={c.color} color="white" strokeWidth={1} />
            <div
              className="absolute left-4 top-2 px-2 py-0.5 rounded text-[9px] font-bold text-black whitespace-nowrap"
              style={{ backgroundColor: c.color }}
            >
              {c.name}
            </div>
          </motion.div>
        ))}
      </div>

    </div>
  );
}
