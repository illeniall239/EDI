'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { MessageSquare, Table, Sparkles, TrendingUp } from 'lucide-react';
import { seededValue } from '@/utils/seededRandom';

export default function HeroFloatingCards() {
    const containerRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end start"]
    });

    const y1 = useTransform(scrollYProgress, [0, 1], [0, -100]);
    const y2 = useTransform(scrollYProgress, [0, 1], [0, -200]);
    const y3 = useTransform(scrollYProgress, [0, 1], [0, -50]);

    return (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Background Gradient Mesh */}
            <div className="absolute inset-0 bg-[#0a0a0f]">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-electric-purple/20 blur-[120px] rounded-full mix-blend-screen animate-float" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-neon-cyan/20 blur-[120px] rounded-full mix-blend-screen animate-float" style={{ animationDelay: '-2s' }} />
            </div>

            <div className="absolute inset-0 container mx-auto px-6">
                {/* Card 1: The Chat (Top Left) */}
                <motion.div
                    style={{ y: y1 }}
                    className="absolute top-[15%] left-[5%] md:left-[10%] w-[280px] md:w-[320px] glass-card p-4 rounded-2xl rotate-[-6deg] z-0 opacity-80"
                    initial={{ opacity: 0, x: -50, rotate: -15 }}
                    animate={{ opacity: 0.8, x: 0, rotate: -6 }}
                    transition={{ duration: 1, delay: 0.2 }}
                >
                    <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                        <div className="w-8 h-8 rounded-full bg-neon-cyan/20 flex items-center justify-center">
                            <MessageSquare className="w-4 h-4 text-neon-cyan" />
                        </div>
                        <span className="text-xs font-semibold text-white/90">AI Assistant</span>
                    </div>
                    <div className="space-y-3">
                        <div className="bg-white/5 rounded-lg p-2 rounded-tl-none">
                            <p className="text-xs text-gray-300">Show me revenue trends for Q1 vs Q2.</p>
                        </div>
                        <div className="bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg p-2 rounded-tr-none ml-4">
                            <p className="text-xs text-white">Here is the comparison. Revenue is up <span className="text-neon-cyan font-bold">24%</span>.</p>
                        </div>
                    </div>
                </motion.div>

                {/* Card 2: The Grid (Right/Center) */}
                <motion.div
                    style={{ y: y2 }}
                    className="absolute top-[30%] right-[5%] md:right-[15%] w-[300px] md:w-[380px] glass-card-strong p-0 rounded-xl rotate-[8deg] z-10 shadow-2xl border border-white/10"
                    initial={{ opacity: 0, x: 50, rotate: 15 }}
                    animate={{ opacity: 1, x: 0, rotate: 8 }}
                    transition={{ duration: 1, delay: 0.4 }}
                >
                    <div className="p-3 border-b border-white/10 flex items-center justify-between bg-black/20">
                        <div className="flex items-center gap-2">
                            <Table className="w-4 h-4 text-electric-purple" />
                            <span className="text-xs font-mono text-gray-400">sales_data.csv</span>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/20" />
                        </div>
                    </div>
                    <div className="p-1">
                        <table className="w-full text-[10px] text-left border-collapse">
                            <thead>
                                <tr className="text-gray-500">
                                    <th className="p-2 font-medium">Product</th>
                                    <th className="p-2 font-medium">Region</th>
                                    <th className="p-2 font-medium">Sales</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white/5">
                                <tr className="border-b border-white/5">
                                    <td className="p-2 text-white/80">MacBook Pro</td>
                                    <td className="p-2 text-gray-400">North</td>
                                    <td className="p-2 font-mono text-white">$12,450</td>
                                </tr>
                                <tr className="border-b border-white/5 bg-neon-cyan/10">
                                    <td className="p-2 text-white/90 font-semibold relative">
                                        iPhone 15
                                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-neon-cyan" />
                                    </td>
                                    <td className="p-2 text-gray-300">East</td>
                                    <td className="p-2 font-mono text-neon-cyan font-bold">$8,200</td>
                                </tr>
                                <tr>
                                    <td className="p-2 text-white/80">iPad Air</td>
                                    <td className="p-2 text-gray-400">West</td>
                                    <td className="p-2 font-mono text-white">$4,100</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                {/* Card 3: The Graph (Bottom Left) */}
                <motion.div
                    style={{ y: y3 }}
                    className="absolute bottom-[20%] left-[15%] w-[260px] glass-card p-4 rounded-2xl rotate-[-3deg] z-20 border-t border-white/20"
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 0.9, y: 0 }}
                    transition={{ duration: 1, delay: 0.6 }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded bg-electric-purple/20 flex items-center justify-center">
                            <TrendingUp className="w-3.5 h-3.5 text-electric-purple" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Growth</span>
                            <span className="text-sm font-bold text-white">+128.5%</span>
                        </div>
                    </div>
                    <div className="h-24 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={[
                                { v: 10 }, { v: 25 }, { v: 20 }, { v: 40 }, { v: 35 }, { v: 50 }, { v: 65 }
                            ]}>
                                <defs>
                                    <linearGradient id="colorV" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ffffff" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotone"
                                    dataKey="v"
                                    stroke="#ffffff"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorV)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            </div>

            {/* Decorative Particles */}
            <div className="absolute inset-0 opacity-30">
                {[...Array(20)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-white rounded-full"
                        initial={{
                            x: seededValue(i, 1) * (typeof window !== 'undefined' ? window.innerWidth : 1000),
                            y: seededValue(i, 2) * (typeof window !== 'undefined' ? window.innerHeight : 800),
                            opacity: 0,
                        }}
                        animate={{
                            y: [null, seededValue(i, 3) * -100],
                            opacity: [0, 1, 0],
                        }}
                        transition={{
                            duration: seededValue(i, 4) * 5 + 3,
                            repeat: Infinity,
                            delay: seededValue(i, 5) * 2
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
