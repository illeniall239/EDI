'use client';

import { ScrollReveal } from '@/components/animations/ScrollReveal';
import CardSwap, { Card } from '@/components/animations/CardSwap';
import {
  Sparkles,
  BarChart3,
  MessageSquare,
  FileText,
  Zap,
  Brain,
} from 'lucide-react';
import AnimatedChat from '@/components/landing/animations/AnimatedChat';
import AnimatedCharts from '@/components/landing/animations/AnimatedCharts';
import AnimatedSpreadsheet from '@/components/landing/animations/AnimatedSpreadsheet';
import AnimatedQuery from '@/components/landing/animations/AnimatedQuery';
import AnimatedReport from '@/components/landing/animations/AnimatedReport';
import AnimatedCollaboration from '@/components/landing/animations/AnimatedCollaboration';

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Analysis',
    description:
      'Ask questions in natural language and get instant insights from your data with advanced AI models.',
    color: 'text-electric-purple',
    gradient: 'from-electric-purple to-deep-purple',
  },
  {
    icon: BarChart3,
    title: 'Auto Visualizations',
    description:
      'Generate beautiful charts and graphs automatically based on your data patterns and queries.',
    color: 'text-neon-cyan',
    gradient: 'from-neon-cyan to-sky-blue',
  },
  {
    icon: Sparkles,
    title: 'Smart Spreadsheets',
    description:
      'Intelligent formulas, data validation, and automated workflows powered by AI.',
    color: 'text-neon-magenta',
    gradient: 'from-neon-magenta to-electric-purple',
  },
  {
    icon: MessageSquare,
    title: 'Natural Language Queries',
    description:
      'Simply ask questions about your data in plain English and get accurate answers instantly.',
    color: 'text-sky-blue',
    gradient: 'from-sky-blue to-neon-cyan',
  },
  {
    icon: FileText,
    title: 'PDF Reports',
    description:
      'Generate professional reports with insights, recommendations, and visualizations automatically.',
    color: 'text-deep-purple',
    gradient: 'from-deep-purple to-electric-purple',
  },
  {
    icon: Zap,
    title: 'Real-time Collaboration',
    description:
      'Work together with your team in real-time with multi-user support and live updates.',
    color: 'text-neon-cyan',
    gradient: 'from-neon-cyan to-neon-magenta',
  },
];

const featureAnimations: Record<string, React.ComponentType<{ isActive?: boolean }>> = {
  'AI-Powered Analysis': AnimatedChat,
  'Auto Visualizations': AnimatedCharts,
  'Smart Spreadsheets': AnimatedSpreadsheet,
  'Natural Language Queries': AnimatedQuery,
  'PDF Reports': AnimatedReport,
  'Real-time Collaboration': AnimatedCollaboration,
};

export function FeatureCards() {
  return (
    <section id="features" className="relative py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-deep-space to-black" />

      <div className="relative z-10 container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Side: Text Content */}
          <div>
            <ScrollReveal direction="fade">
              <div className="mb-12">
                <h2 className="text-5xl md:text-6xl font-display font-bold gradient-text-holographic mb-6">
                  Powerful Features
                </h2>
                <p className="text-xl text-gray-400 max-w-xl">
                  Everything you need to transform data into actionable intelligence
                </p>
              </div>
            </ScrollReveal>

            {/* Feature List */}
            <div className="space-y-6">
              {features.map((feature, index) => (
                <ScrollReveal
                  key={feature.title}
                  direction="left"
                  delay={index * 0.1}
                >
                  <div className="flex items-start gap-4 group cursor-pointer">
                    {/* Icon */}
                    <div
                      className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}
                    >
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>

                    {/* Content */}
                    <div>
                      <h3
                        className={`text-xl font-display font-bold mb-2 ${feature.color} group-hover:translate-x-1 transition-transform duration-300`}
                      >
                        {feature.title}
                      </h3>
                      <p className="text-gray-400 leading-relaxed text-sm">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>

          {/* Right Side: Card Stack Animation */}
          <div className="relative h-[600px] hidden lg:block">
            <CardSwap
              width={500}
              height={480}
              cardDistance={60}
              verticalDistance={70}
              delay={5000}
              pauseOnHover={false}
              easing="elastic"
            >
              {features.map((feature, index) => {
                const AnimationComponent = featureAnimations[feature.title];
                return (
                  <Card key={index}>
                    <div className="glass-card-strong h-full p-6 flex flex-col">
                      {/* Gradient accent bar */}
                      <div className="gradient-accent mb-4" />

                      {/* Animation Component - takes most of the card space */}
                      <div className="flex-1 flex items-center justify-center mb-4">
                        {AnimationComponent && <AnimationComponent isActive={true} />}
                      </div>

                      {/* Title and description at bottom */}
                      <div className="flex-shrink-0">
                        <h3
                          className={`text-xl font-display font-bold mb-2 ${feature.color}`}
                        >
                          {feature.title}
                        </h3>
                        <p className="text-gray-300 leading-relaxed text-sm">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </CardSwap>
          </div>
        </div>
      </div>
    </section>
  );
}
