'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, User } from 'lucide-react';

interface AnimatedChatProps {
  isActive?: boolean;
}

type AnimationStep = 'ide' | 'user' | 'typing' | 'response' | 'chart';

export default function AnimatedChat({ isActive = true }: AnimatedChatProps) {
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
        // Reset
        setStep('ide');
        await new Promise((r) => (timeoutId = setTimeout(r, 500)));
        if (!isMounted) break;

        // User asks question
        setStep('user');
        await new Promise((r) => (timeoutId = setTimeout(r, 1500)));
        if (!isMounted) break;

        // AI is typing
        setStep('typing');
        await new Promise((r) => (timeoutId = setTimeout(r, 1000)));
        if (!isMounted) break;

        // AI responds
        setStep('response');
        await new Promise((r) => (timeoutId = setTimeout(r, 1500)));
        if (!isMounted) break;

        // Chart appears
        setStep('chart');
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
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 relative z-10">

        {/* User Message */}
        <AnimatePresence>
          {step !== 'ide' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex justify-end gap-3"
            >
              <div className="bg-gradient-to-br from-neon-cyan/20 to-sky-blue/20 border border-neon-cyan/30 px-4 py-2 rounded-2xl rounded-tr-sm">
                <p className="text-sm text-white/90">Top products?</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-cyan to-sky-blue flex items-center justify-center shadow-lg">
                <User className="w-4 h-4 text-white" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Typing / Response */}
        <AnimatePresence mode="wait">
          {step === 'typing' && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex justify-start gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-electric-purple to-deep-purple flex items-center justify-center shadow-lg">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div className="glass-card-strong px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </motion.div>
          )}

          {(step === 'response' || step === 'chart') && (
            <motion.div
              key="response"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-start gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-electric-purple to-deep-purple flex items-center justify-center shadow-lg">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div className="glass-card-strong px-4 py-3 rounded-2xl rounded-tl-sm space-y-3">
                <p className="text-sm text-white/90">
                  <span className="font-semibold text-neon-cyan">Electronics</span> lead with $45k revenue.
                </p>

                {/* Mini Chart */}
                {step === 'chart' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="flex items-end gap-2 h-16 pt-2 border-t border-white/10"
                  >
                    {[40, 70, 100].map((h, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ delay: i * 0.1 }}
                        className="flex-1 rounded-t-sm bg-gradient-to-t from-electric-purple to-neon-magenta opacity-80"
                      />
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
