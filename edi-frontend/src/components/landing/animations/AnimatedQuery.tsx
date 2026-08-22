'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';

interface AnimatedQueryProps {
  isActive?: boolean;
}

type AnimationStep = 'ide' | 'typing' | 'processing' | 'results';

export default function AnimatedQuery({ isActive = true }: AnimatedQueryProps) {
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

        setStep('typing');
        await new Promise((r) => (timeoutId = setTimeout(r, 1500)));
        if (!isMounted) break;

        setStep('processing');
        await new Promise((r) => (timeoutId = setTimeout(r, 1000)));
        if (!isMounted) break;

        setStep('results');
        await new Promise((r) => (timeoutId = setTimeout(r, 4000)));
      }
    };

    runSequence();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isActive]);

  const results = [
    { name: 'MacBook Pro', sales: '$15.8k', highlight: true },
    { name: 'iPhone 15', sales: '$12.4k', highlight: true },
    { name: 'iPad Air', sales: '$8.2k', highlight: true },
    { name: 'AirPods', sales: '$4.5k', highlight: false },
  ];

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 gap-4">
      {/* Search Bar */}
      <div className="w-full max-w-sm relative z-10">
        <div className={`glass-card-strong rounded-xl p-3 flex items-center gap-3 transition-shadow duration-300 ${step === 'typing' || step === 'processing' ? 'shadow-[0_0_15px_rgba(255,255,255,0.3)] border-neon-cyan/30' : ''}`}>
          <Search className={`w-4 h-4 ${step === 'processing' ? 'text-neon-cyan animate-pulse' : 'text-gray-400'}`} />
          <div className="flex-1 text-sm font-medium text-white/90 h-5 relative overflow-hidden">
            {step === 'ide' && <span className="text-gray-500">Search data...</span>}
            {step === 'typing' && (
              <div className="flex items-center">
                <span className="whitespace-nowrap overflow-hidden animate-[typing_1.5s_steps(20,end)]">
                  Show sales above $8k
                </span>
                <span className="animate-pulse text-neon-cyan">|</span>
              </div>
            )}
            {(step === 'processing' || step === 'results') && <span>Show sales above $8k</span>}
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="w-full max-w-sm relative h-48">
        <AnimatePresence>
          {step === 'results' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute inset-0 space-y-2"
            >
              {results.map((item, i) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: item.highlight ? 1 : 0.4, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center justify-between p-2 rounded-lg 
                    ${item.highlight ? 'bg-neon-cyan/10 border border-neon-cyan/20' : 'bg-white/5 border border-transparent'}
                  `}
                >
                  <span className="text-[11px] text-white/90">{item.name}</span>
                  <span className={`text-[11px] font-mono ${item.highlight ? 'text-neon-cyan font-bold' : 'text-gray-400'}`}>
                    {item.sales}
                  </span>
                </motion.div>
              ))}

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5 }}
                className="absolute -top-2 -right-2 bg-gradient-to-r from-neon-cyan to-sky-blue text-black text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg"
              >
                3 found
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
