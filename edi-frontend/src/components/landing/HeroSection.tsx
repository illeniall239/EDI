'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import Link from 'next/link';
import Squares from './Squares';

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0a0a0f]">

      {/* Background */}
      <div className="absolute inset-0 z-0">
        <Squares
          speed={0.5}
          squareSize={40}
          direction='diagonal'
          borderColor='#333'
          hoverFillColor='#222'
        />
      </div>

      <div className="container mx-auto px-6 relative z-10 text-center flex flex-col items-center">

        {/* Badge */}
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-md"
        >
          <Sparkles className="w-3.5 h-3.5 text-neon-cyan" />
          <span className="text-xs font-medium text-white">Intelligent Data Analysis</span>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-6xl md:text-8xl font-display font-bold tracking-tight mb-8 drop-shadow-2xl"
        >
          <span className="text-white">The AI-Powered</span>
          <br />
          <span className="text-neon-cyan">
            Spreadsheet.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-xl text-gray-100 max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          Analyze data, automate workflows, and visualize trends using natural language.
          Experience the power of a data team in a simple spreadsheet interface.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-5"
        >
          <Link
            href="/auth"
            className="group relative px-8 py-4 bg-white text-black rounded-full font-bold text-base overflow-hidden flex items-center gap-2 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all"
          >
            <span>Start Analyzing</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="#demo"
            className="group px-8 py-4 rounded-full font-medium text-white border border-white/20 hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <Play className="w-3 h-3 text-white fill-white" />
            </div>
            <span>Watch Demo</span>
          </Link>
        </motion.div>

      </div>
    </section>
  );
}
