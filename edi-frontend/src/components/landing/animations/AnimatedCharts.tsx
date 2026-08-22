'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';

interface AnimatedChartsProps {
  isActive?: boolean;
}

export default function AnimatedCharts({ isActive = true }: AnimatedChartsProps) {
  const [data, setData] = useState([40, 70, 90]);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    // Force show chart immediately for debugging/visibility
    setShowChart(true);

    const interval = setInterval(() => {
      // Randomize data every 3 seconds to show it's "live"
      setData([
        Math.floor(Math.random() * 40) + 30, // 30-70
        Math.floor(Math.random() * 40) + 40, // 40-80
        Math.floor(Math.random() * 30) + 60, // 60-90
      ].sort((a, b) => a - b));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 relative">
      <div className="w-full h-full glass-card-strong rounded-xl p-4 flex flex-col relative z-10 border border-white/10">

        {/* Title */}
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-neon-cyan" />
          <span className="text-sm font-semibold text-white/90">Revenue Trend</span>
        </div>

        {/* Chart Area */}
        <div className="flex-1 flex items-end justify-between gap-4 w-full h-full min-h-[120px] relative">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
            <div className="w-full h-px bg-white/30"></div>
            <div className="w-full h-px bg-white/30"></div>
            <div className="w-full h-px bg-white/30"></div>
            <div className="w-full h-px bg-white/30"></div>
          </div>

          {/* Bars using standard colors to ensure visibility */}
          {data.map((h, i) => (
            <div key={i} className="flex-1 h-full flex flex-col justify-end items-center relative z-10 group">
              <motion.div
                initial={{ height: '10%' }}
                animate={{ height: `${h}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 15 }}
                className={`w-full rounded-t-md relative overflow-hidden
                    ${i === 0 ? 'bg-cyan-500' : ''}
                    ${i === 1 ? 'bg-purple-500' : ''} 
                    ${i === 2 ? 'bg-fuchsia-500' : ''}
                  `}
              >
                {/* Shine effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-white/20" />
                <div className="absolute top-0 left-0 right-0 h-1 bg-white/40" />
              </motion.div>

              {/* Label */}
              <div className="mt-2 text-[10px] text-gray-400 font-mono">
                {['Jan', 'Feb', 'Mar'][i]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
