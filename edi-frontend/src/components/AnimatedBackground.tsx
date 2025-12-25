import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface AnimatedBackgroundProps {
  className?: string;
}

export default function AnimatedBackground({ className = '' }: AnimatedBackgroundProps) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-0 ${className}`}>
      {/* Floating grid effect */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div 
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(37,99,235,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem]"
          animate={{
            y: [0, -100],
          }}
          transition={{
            repeat: Infinity,
            repeatType: "loop",
            duration: 60,
            ease: "linear",
          }}
        />
      </div>

      {/* Horizontal grid lines with animation */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div 
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:100%_2rem]"
          animate={{
            y: [0, -50],
          }}
          transition={{
            repeat: Infinity,
            repeatType: "loop",
            duration: 30,
            ease: "linear",
          }}
        />
      </div>

      {/* Diagonal grid lines with animation */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        <motion.div 
          className="absolute inset-0 bg-[linear-gradient(45deg,rgba(37,99,235,0.02)_1px,transparent_1px)] bg-[size:3rem_3rem]"
          animate={{
            backgroundPosition: ["0px 0px", "100px 100px"]
          }}
          transition={{
            repeat: Infinity,
            repeatType: "loop",
            duration: 40,
            ease: "linear",
          }}
        />
      </div>

      {/* Animated dots */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-primary/20"
            style={{
              width: Math.random() * 4 + 1,
              height: Math.random() * 4 + 1,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0.1, 0.5, 0.1],
              scale: [1, 1.5, 1],
            }}
            transition={{
              repeat: Infinity,
              duration: Math.random() * 5 + 5,
              delay: Math.random() * 5,
            }}
          />
        ))}
      </div>

      {/* Add subtle glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full filter blur-[100px]"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full filter blur-[100px]"></div>
      <div className="absolute top-3/4 right-1/4 w-64 h-64 bg-indigo-500/5 rounded-full filter blur-[80px]"></div>
      <div className="absolute bottom-1/3 left-1/3 w-64 h-64 bg-indigo-500/5 rounded-full filter blur-[80px]"></div>
      
      {/* Add a subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black opacity-60"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black opacity-60"></div>
    </div>
  );
} 