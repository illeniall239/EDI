'use client';

import { motion } from 'framer-motion';

export default function HeroIsometricIllustration() {
    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none md:pointer-events-auto">
            <div className="relative w-[800px] h-[800px] perspective-[2000px] scale-[0.6] md:scale-90">
                {/* Scene Container */}
                <motion.div
                    className="w-full h-full transform-style-3d relative"
                    initial={{ rotateX: 60, rotateZ: 45, opacity: 0 }}
                    animate={{ rotateX: 60, rotateZ: 45, opacity: 1 }}
                    transition={{ duration: 1.2, ease: "circOut" }}
                    style={{ transformStyle: 'preserve-3d' }}
                >
                    {/* ==================== 1. MAIN PLATFORM ==================== */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] transform-style-3d">
                        {/* Floor */}
                        <div className="absolute inset-0 bg-[#0F111A] border border-white/10 shadow-2xl">
                            {/* Grid Texture */}
                            <div className="absolute inset-0 grid grid-cols-10 grid-rows-10 gap-[1px] bg-white/5 opacity-50">
                                {Array.from({ length: 100 }).map((_, i) => (
                                    <div key={i} className="bg-transparent" />
                                ))}
                            </div>
                        </div>
                        {/* 3D Thickness */}
                        <div className="absolute inset-x-0 top-full h-8 bg-[#090a10] origin-top rotate-x-[-90deg]" />
                        <div className="absolute inset-y-0 right-0 w-8 h-full bg-[#050608] origin-right rotate-y-[-90deg]" />
                    </div>


                    {/* ==================== 2. DATA COLUMNS (THE "CITY") ==================== */}
                    {/* Center Cluster */}
                    <DataColumn x={150} y={150} h={120} color="from-neon-cyan to-deep-purple" delay={0.2} />
                    <DataColumn x={150} y={230} h={80} color="from-sky-blue to-deep-purple" delay={0.3} />
                    <DataColumn x={230} y={150} h={160} color="from-electric-purple to-deep-purple" delay={0.4} />
                    <DataColumn x={230} y={230} h={100} color="from-neon-magenta to-deep-purple" delay={0.5} />

                    {/* Satellite Nodes */}
                    <DataColumn x={350} y={100} h={60} color="from-gray-700 to-gray-900" delay={0.6} />
                    <DataColumn x={100} y={350} h={90} color="from-gray-700 to-gray-900" delay={0.7} />


                    {/* ==================== 3. ABSTRACT "PEOPLE" ==================== */}

                    {/* User 1: The Analyst (Interacting with center stack) */}
                    <AbstractPerson x={100} y={200} color="bg-neon-cyan" rotate={-45} />
                    {/* Connection Line */}
                    <ConnectionLine x1={100} y1={200} z1={60} x2={150} y2={230} z2={80} color="bg-neon-cyan" />

                    {/* User 2: The Manager (Observing from distance) */}
                    <AbstractPerson x={400} y={350} color="bg-orange-500" rotate={30} />
                    {/* Connection Line */}
                    <ConnectionLine x1={400} y1={350} z1={60} x2={230} y2={230} z2={100} color="bg-orange-500" />

                    {/* User 3: The Engineer (Near the back) */}
                    <AbstractPerson x={300} y={50} color="bg-green-500" rotate={180} />


                    {/* ==================== 4. FLOATING ELEMENTS (DASHBOARDS) ==================== */}

                    {/* Floating Screen 1 */}
                    <motion.div
                        className="absolute w-32 h-20 bg-black/80 border border-white/20 backdrop-blur-sm transform-style-3d"
                        style={{
                            left: 130, top: 130,
                            transform: 'translateZ(180px) rotateX(-90deg) rotateY(45deg)'
                        }}
                        animate={{ translateZ: [180, 190, 180] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <div className="p-2 space-y-1">
                            <div className="w-full h-1 bg-neon-cyan rounded-full" />
                            <div className="w-2/3 h-1 bg-white/20 rounded-full" />
                            <div className="flex gap-1 mt-2 items-end h-8">
                                <div className="w-2 h-4 bg-purple-500" />
                                <div className="w-2 h-6 bg-purple-500" />
                                <div className="w-2 h-3 bg-purple-500" />
                            </div>
                        </div>
                    </motion.div>

                </motion.div>
            </div>
        </div>
    );
}

function DataColumn({ x, y, h, color, delay }: any) {
    return (
        <motion.div
            className="absolute w-16 h-16 transform-style-3d"
            style={{ left: x, top: y }}
            initial={{ translateZ: -200, opacity: 0 }}
            animate={{ translateZ: 0, opacity: 1 }}
            transition={{ duration: 1, delay, type: "spring" }}
        >
            {/* Top Cap */}
            <div className={`absolute inset-0 bg-gradient-to-tr ${color} border-t border-l border-white/30`} style={{ transform: `translateZ(${h}px)` }} />

            {/* Front Face */}
            <div className={`absolute inset-x-0 top-full h-[${h}px] bg-gradient-to-b from-white/10 to-transparent origin-top rotate-x-[-90deg]`}
                style={{ height: h, backgroundColor: 'rgba(255,255,255,0.05)' }} >
                {/* Vertical Lines */}
                <div className="w-full h-full border-x border-white/10" />
            </div>

            {/* Right Face */}
            <div className={`absolute inset-y-0 right-0 w-[${h}px] bg-gradient-to-b from-black/20 to-transparent origin-right rotate-y-[-90deg]`}
                style={{ width: h, backgroundColor: 'rgba(0,0,0,0.5)' }} >
                <div className="w-full h-full border-x border-white/10" />
            </div>
        </motion.div>
    )
}

function AbstractPerson({ x, y, color, rotate }: any) {
    // A simple 3D cylinder-like person
    const h = 60; // body height
    return (
        <motion.div
            className="absolute w-8 h-8 transform-style-3d"
            style={{ left: x, top: y, transform: `translateZ(0px) rotateZ(${rotate}deg)` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1, type: "spring" }}
        >
            {/* Body (Cylinder approximation with 2 planes) */}
            <div className={`absolute inset-x-0 -top-full w-8 h-[${h}px] bg-white opacity-20 origin-bottom rotate-x-[90deg]`} style={{ height: h }} />
            <div className={`absolute -inset-y-full left-0 w-[${h}px] h-8 bg-white opacity-10 origin-left rotate-y-[-90deg]`} style={{ width: h }} />

            {/* Head */}
            <div
                className={`absolute left-0 top-0 w-8 h-8 rounded-full ${color} shadow-[0_0_20px_rgba(255,255,255,0.5)]`}
                style={{ transform: `translateZ(${h + 10}px) rotateX(-90deg)` }}
            >
                {/* Face Glow */}
                <div className="absolute inset-0 bg-white/50 blur-sm rounded-full" />
            </div>

            {/* Shadow */}
            <div className="absolute inset-0 bg-black/50 blur-md rounded-full transform translate-z-[1px]" />
        </motion.div>
    )
}

function ConnectionLine({ x1, y1, z1, x2, y2, z2, color }: any) {
    // Calculate length and angle for a simplified line connection (CSS line is tricky in 3D)
    // We will use an SVG overlay for simpler connections if needed, but here's a DOM method
    // Actually, SVG is better for line connectivity between dynamic coordinates, 
    // but sticking to DOM for consistency with the scene graph.
    // Let's use a "beam" particle stream instead.

    return (
        <div
            className="absolute w-2 h-2 rounded-full transform-style-3d overflow-visible pointer-events-none"
            style={{ left: x1, top: y1, transform: `translateZ(${z1}px)` }}
        >
            {/* Beam to target */}
            <motion.div
                className={`absolute top-1/2 left-1/2 w-1 h-1 rounded-full ${color}`}
                animate={{
                    transform: [
                        `translate3d(0,0,0)`,
                        `translate3d(${x2 - x1}px, ${y2 - y1}px, ${z2 - z1}px)`
                    ],
                    opacity: [1, 0]
                }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
        </div>
    )
}
