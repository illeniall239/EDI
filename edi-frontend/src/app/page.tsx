'use client';

import Navigation from '@/components/Navigation';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeatureCards } from '@/components/landing/FeatureCards';
import { WaveFooter } from '@/components/landing/WaveFooter';
import { GlassmorphicCard } from '@/components/effects/GlassmorphicCard';
import { ScrollReveal } from '@/components/animations/ScrollReveal';

import { Check, X } from 'lucide-react';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-x-hidden">
      <Navigation />

      {/* Hero Section with 3D Effects */}
      <HeroSection />

      {/* Product Screenshot Section */}
      <section className="relative py-24 bg-gradient-to-b from-black via-deep-space to-black">
        <div className="container mx-auto px-6">
          <ScrollReveal direction="fade">
            <div className="max-w-6xl mx-auto">
              {/* Browser Frame Mockup */}
              <div className="relative group">
                {/* Multiple shadow layers for depth */}
                <div className="absolute inset-0 bg-electric-purple/20 rounded-2xl blur-3xl translate-y-8 scale-105 opacity-60" />
                <div className="absolute inset-0 bg-neon-magenta/20 rounded-2xl blur-xl translate-y-4 scale-102 opacity-80" />

                {/* Browser Window */}
                <GlassmorphicCard className="overflow-hidden" variant="strong">
                  {/* Browser Chrome */}
                  <div className="bg-black/90 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center gap-3">
                    {/* Window controls */}
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full" />
                      <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                      <div className="w-3 h-3 bg-green-500 rounded-full" />
                    </div>

                    {/* URL bar */}
                    <div className="flex-1 mx-4">
                      <div className="bg-white/5 rounded-lg px-4 py-2 border border-white/10 flex items-center gap-3">
                        <svg
                          className="w-4 h-4 text-green-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        <span className="text-gray-300 text-sm font-mono">
                          app.edi.ai
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Screenshot */}
                  <div className="relative bg-white overflow-hidden">
                    <Image
                      src="/product_ss.png"
                      alt="EDI.ai Product Screenshot"
                      width={1200}
                      height={800}
                      className="w-full h-auto"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 via-transparent to-black/5 pointer-events-none" />
                  </div>
                </GlassmorphicCard>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Features Section */}
      <FeatureCards />

      {/* Comparison Section */}
      <section className="relative py-32 overflow-hidden bg-gradient-to-b from-black via-deep-space to-black">
        <div className="container mx-auto px-6">
          {/* Section Header */}
          <ScrollReveal direction="fade">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-display font-bold gradient-text-holographic mb-6">
                Traditional vs AI-Powered
              </h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                See the difference AI makes in your daily workflow
              </p>
            </div>
          </ScrollReveal>

          {/* Comparison Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Traditional Side */}
            <ScrollReveal direction="left">
              <GlassmorphicCard className="p-8 h-full grayscale hover:grayscale-0 transition-all duration-500">
                <h3 className="text-2xl font-display font-bold text-center mb-8 text-white">
                  Traditional Spreadsheets
                </h3>
                <div className="space-y-4">
                  {[
                    {
                      label: 'Complex Formulas',
                      desc: '=VLOOKUP(A2,Sheet2!A:C,3,FALSE)',
                    },
                    {
                      label: 'Manual Analysis',
                      desc: 'Hours of manual pivot tables',
                    },
                    {
                      label: 'Chart Creation',
                      desc: '10+ clicks to create basic charts',
                    },
                    {
                      label: 'Error Prone',
                      desc: '#N/A, #REF! errors everywhere',
                    },
                    {
                      label: 'Limited Collaboration',
                      desc: 'Email spreadsheets back and forth',
                    },
                    {
                      label: 'Steep Learning Curve',
                      desc: 'Master complex formulas and functions',
                    },
                  ].map((item, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <X className="text-red-400 mt-1 w-5 h-5 flex-shrink-0" />
                      <div>
                        <p className="text-white font-medium">{item.label}</p>
                        <p className="text-gray-400 text-sm">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassmorphicCard>
            </ScrollReveal>

            {/* EDI.ai Side */}
            <ScrollReveal direction="right">
              <GlassmorphicCard
                className="p-8 h-full glow"
                variant="strong"
                glowColor="cyan"
              >
                <h3 className="text-2xl font-display font-bold text-center mb-8 gradient-text-holographic">
                  EDI.ai
                </h3>
                <div className="space-y-4">
                  {[
                    {
                      label: 'Natural Language',
                      desc: '"Show me customer purchase history"',
                    },
                    {
                      label: 'Instant AI Insights',
                      desc: 'AI-powered analysis in seconds',
                    },
                    {
                      label: 'Auto-Generated Charts',
                      desc: 'Charts created automatically from questions',
                    },
                    {
                      label: 'Error-Free',
                      desc: 'AI validates and corrects automatically',
                    },
                    {
                      label: 'Real-Time Collaboration',
                      desc: 'Collaborative AI workspace',
                    },
                    {
                      label: 'Zero Learning Curve',
                      desc: 'Just speak naturally to your data',
                    },
                  ].map((item, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <Check className="text-neon-cyan mt-1 w-5 h-5 flex-shrink-0" />
                      <div>
                        <p className="text-white font-medium">{item.label}</p>
                        <p className="text-gray-400 text-sm">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassmorphicCard>
            </ScrollReveal>
          </div>
        </div>
      </section>



      {/* Footer */}
      <WaveFooter />
    </div>
  );
}
