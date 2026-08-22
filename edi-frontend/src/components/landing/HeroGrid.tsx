'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function HeroGrid() {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Normalize mouse position (-1 to 1)
            setMousePos({
                x: (e.clientX / window.innerWidth) * 2 - 1,
                y: (e.clientY / window.innerHeight) * 2 - 1,
            });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible">
            {/* Ambient Glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-deep-space via-deep-space to-neon-cyan/5 blur-3xl opacity-30" />

            <div
                className="relative w-[600px] h-[600px] perspective-[1000px] transform-gpu"
                style={{ transform: 'scale(1.2)' }}
            >
                <motion.div
                    className="relative w-full h-full transform-style-3d"
                    initial={{ rotateX: 60, rotateZ: -45, scale: 0.8, opacity: 0 }}
                    animate={{ rotateX: 60, rotateZ: -45, scale: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    style={{
                        transformStyle: 'preserve-3d',
                    }}
                >
                    {/* Layer 1: Bottom (Raw Data) */}
                    <SheetLayer
                        depth={-50}
                        mousePos={mousePos}
                        factor={20}
                        color="border-white/5"
                        bg="bg-black/40"
                    >
                        <GridPattern opacity={0.3} />
                    </SheetLayer>

                    {/* Layer 2: Middle (Processing) */}
                    <SheetLayer
                        depth={50}
                        mousePos={mousePos}
                        factor={40}
                        color="border-neon-cyan/30"
                        bg="bg-neon-cyan/5"
                    >
                        <GridPattern opacity={0.5} active />
                        {/* Connecting Lines */}
                        <div className="absolute top-10 left-10 right-10 bottom-10 border border-neon-cyan/20 rounded shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
                    </SheetLayer>

                    {/* Layer 3: Top (Insights) */}
                    <SheetLayer
                        depth={150}
                        mousePos={mousePos}
                        factor={60}
                        color="border-white/20"
                        bg="bg-glass-white backdrop-blur-sm"
                    >
                        {/* Floating Widgets */}
                        <div className="absolute top-1/4 left-1/4 w-32 h-20 bg-black/60 border border-neon-magenta/50 rounded-lg shadow-xl p-2 flex flex-col gap-2 transform translate-z-10">
                            <div className="w-full h-2 bg-white/20 rounded-full" />
                            <div className="w-2/3 h-2 bg-white/20 rounded-full" />
                            <div className="flex gap-1 mt-auto items-end h-8">
                                <div className="flex-1 bg-neon-magenta h-[40%] rounded-t-sm" />
                                <div className="flex-1 bg-neon-magenta h-[80%] rounded-t-sm" />
                                <div className="flex-1 bg-neon-magenta h-[60%] rounded-t-sm" />
                            </div>
                        </div>

                        <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-black/60 border border-electric-purple/50 rounded-full shadow-xl flex items-center justify-center">
                            <div className="text-xl font-bold text-electric-purple">85%</div>
                        </div>
                    </SheetLayer>

                    {/* Connecting Beams */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ opacity: [0.2, 0.5, 0.2] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        style={{ transform: 'translateZ(0px)' }}
                    >
                        <div className="absolute left-1/2 top-1/2 w-1 h-[200px] bg-gradient-to-b from-neon-cyan to-transparent origin-bottom transform -translate-x-1/2 -translate-y-1/2 -rotate-x-90" />
                    </motion.div>

                </motion.div>
            </div>
        </div>
    );
}

function SheetLayer({ depth, mousePos, factor, children, color, bg }: any) {
    return (
        <motion.div
            className={`absolute inset-0 rounded-xl border ${color} ${bg} shadow-2xl overflow-hidden`}
            style={{
                transform: `translateZ(${depth}px)`,
            }}
            animate={{
                x: mousePos.x * factor,
                y: mousePos.y * factor,
            }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        >
            {children}
            {/* Shine */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
        </motion.div>
    )
}

function GridPattern({ opacity, active }: any) {
    return (
        <div className="w-full h-full grid grid-cols-6 grid-rows-6 gap-[1px] bg-transparent p-4">
            {Array.from({ length: 36 }).map((_, i) => (
                <div
                    key={i}
                    className={`relative border border-white/${opacity * 10} rounded-sm flex items-center justify-center group`}
                >
                    {active && Math.random() > 0.8 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 2 }}
                            className="w-full h-full bg-neon-cyan/20"
                        />
                    )}
                </div>
            ))}
        </div>
    )
}
