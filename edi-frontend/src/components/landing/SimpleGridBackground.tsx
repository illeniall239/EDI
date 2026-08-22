'use client';

export default function SimpleGridBackground() {
    return (
        <div className="absolute inset-0 bg-[#0a0a0f] overflow-hidden -z-10">
            {/* 2D Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />

            {/* Radial Fade (Vignette) */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,#0a0a0f00, #0a0a0f)] pointer-events-none" />

            {/* Subtle Moving Glow */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-electric-purple/20 blur-[120px] rounded-full animate-float opacity-40 mix-blend-screen" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-neon-cyan/20 blur-[120px] rounded-full animate-float opacity-40 mix-blend-screen" style={{ animationDelay: '-2s' }} />
        </div>
    );
}
