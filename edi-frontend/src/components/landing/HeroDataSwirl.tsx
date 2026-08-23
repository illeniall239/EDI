'use client';

import { motion } from 'framer-motion';
import { seededValue } from '@/utils/seededRandom';

export default function HeroDataSwirl() {
    const rings = [1, 2, 3];

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            {/* Central Glow */}
            <div className="absolute w-[400px] h-[400px] bg-electric-purple/20 blur-[100px] rounded-full" />

            <div className="relative w-[600px] h-[600px] perspective-[1000px]">
                <motion.div
                    className="w-full h-full transform-style-3d relative"
                    animate={{ rotateX: [20, 40, 20], rotateY: [0, 360] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                    {rings.map((ring, i) => (
                        <DataRing key={i} index={i} total={rings.length} />
                    ))}

                    {/* Core */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-gradient-to-br from-neon-cyan to-electric-purple rounded-full blur-md opacity-50 animate-pulse" />
                </motion.div>
            </div>
        </div>
    );
}

function DataRing({ index, total }: { index: number, total: number }) {
    const count = 12 + (index * 6); // More items in outer rings
    const radius = 100 + (index * 80);

    return (
        <div className="absolute inset-0 transform-style-3d">
            {Array.from({ length: count }).map((_, i) => {
                const angle = (i / count) * 360;
                const delay = seededValue(index * 100 + i, 1) * 2;

                return (
                    <motion.div
                        key={i}
                        className="absolute left-1/2 top-1/2 w-8 h-5 flex items-center justify-center"
                        style={{
                            transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0.3, scale: 0.8 }}
                            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                            transition={{ duration: 3, delay, repeat: Infinity }}
                            className={`w-full h-full border rounded-sm flex items-center justify-center bg-black/40 backdrop-blur-sm
                      ${index === 0 ? 'border-neon-cyan/50' : ''}
                      ${index === 1 ? 'border-neon-magenta/50' : ''}
                      ${index === 2 ? 'border-electric-purple/50' : ''}
                    `}
                        >
                            {/* Random fake data */}
                            <div className="w-1/2 h-[2px] bg-white/40 rounded-full" />
                        </motion.div>
                    </motion.div>
                )
            })}
        </div>
    )
}
