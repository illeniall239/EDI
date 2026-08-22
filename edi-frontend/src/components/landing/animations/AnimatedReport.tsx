'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, BarChart3, Database } from 'lucide-react';

interface AnimatedReportProps {
  isActive?: boolean;
}

type AnimationStep = 'ide' | 'gather' | 'process' | 'preview';

export default function AnimatedReport({ isActive = true }: AnimatedReportProps) {
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

        setStep('gather');
        await new Promise((r) => (timeoutId = setTimeout(r, 1500)));
        if (!isMounted) break;

        setStep('process');
        await new Promise((r) => (timeoutId = setTimeout(r, 1000)));
        if (!isMounted) break;

        setStep('preview');
        await new Promise((r) => (timeoutId = setTimeout(r, 4000)));
      }
    };

    runSequence();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isActive]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      <div className="relative w-full h-48 flex items-center justify-center">

        {/* Source Icons */}
        <AnimatePresence>
          {(step === 'gather' || step === 'process') && (
            <>
              <motion.div
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: step === 'process' ? 0 : -60, opacity: step === 'process' ? 0 : 1, scale: step === 'process' ? 0.5 : 1 }}
                className="absolute left-1/2 -ml-4 top-1/2 -mt-4 w-10 h-10 rounded-lg bg-deep-purple/30 border border-electric-purple/50 flex items-center justify-center shadow-lg"
              >
                <Database className="w-5 h-5 text-electric-purple" />
              </motion.div>
              <motion.div
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: step === 'process' ? 0 : 60, opacity: step === 'process' ? 0 : 1, scale: step === 'process' ? 0.5 : 1 }}
                className="absolute left-1/2 -ml-4 top-1/2 -mt-4 w-10 h-10 rounded-lg bg-sky-blue/30 border border-neon-cyan/50 flex items-center justify-center shadow-lg"
              >
                <BarChart3 className="w-5 h-5 text-neon-cyan" />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Processing / Stack */}
        <AnimatePresence>
          {step === 'process' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.1, opacity: 1 }}
              exit={{ scale: 1, opacity: 0 }}
              className="absolute z-10"
            >
              <div className="w-12 h-16 bg-white/10 rounded border border-white/20 animate-pulse shadow-[0_0_20px_rgba(102,126,234,0.5)]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Final Document */}
        <AnimatePresence>
          {step === 'preview' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute z-20 w-32 h-44 glass-card-strong rounded-md border border-white/10 p-3 shadow-2xl flex flex-col gap-2"
            >
              {/* Header */}
              <div className="w-full h-2 bg-white/20 rounded-sm mb-1" />
              <div className="w-2/3 h-2 bg-white/20 rounded-sm mb-3" />

              {/* Chart */}
              <div className="flex items-end gap-1 h-12 mb-2">
                <div className="flex-1 bg-electric-purple/50 h-[60%] rounded-t-sm" />
                <div className="flex-1 bg-neon-cyan/50 h-[90%] rounded-t-sm" />
                <div className="flex-1 bg-neon-magenta/50 h-[40%] rounded-t-sm" />
              </div>

              {/* Text */}
              <div className="space-y-1">
                <div className="w-full h-1 bg-white/10 rounded-sm" />
                <div className="w-full h-1 bg-white/10 rounded-sm" />
                <div className="w-4/5 h-1 bg-white/10 rounded-sm" />
                <div className="w-full h-1 bg-white/10 rounded-sm" />
              </div>

              {/* Watermark */}
              <div className="absolute bottom-2 right-2">
                <FileText className="w-4 h-4 text-neon-cyan opacity-40" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
      {/* State Text */}
      <div className="absolute bottom-2 left-0 right-0 text-center">
        <span className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">
          {step === 'process' ? 'Generating...' : step === 'preview' ? 'Report Ready' : ''}
        </span>
      </div>
    </div>
  );
}
