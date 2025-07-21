'use client';

import Navigation from '@/components/Navigation';
import { TypeAnimation } from 'react-type-animation';
import { useEffect, useRef, useState } from 'react';
import AnimatedElement from '@/components/AnimatedElement';
import { motion } from 'framer-motion';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Import AnimatedBackground with dynamic loading to avoid SSR issues
const AnimatedBackground = dynamic(
  () => import('@/components/AnimatedBackground'),
  { ssr: false }
);

export default function Home() {
    const [currentQuery, setCurrentQuery] = useState(0);
    const [showResponse, setShowResponse] = useState(false);
    const [visibleResponses, setVisibleResponses] = useState<number[]>([]);
    const [queryTypingComplete, setQueryTypingComplete] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const router = useRouter();

    // Define queries and their responses
    const queries = [
        {
            query: 'Analyze this sales dataset and show quarterly trends',
            response: [
                'Analyzing sales data across all quarters...',
                'Q4 shows highest growth rate: +23% YoY',
                'Identified seasonal pattern in enterprise segment',
                'Revenue forecast: $3.2M for next quarter',
                'Creating visualization of quarterly performance...'
            ]
        },
        {
            query: 'Find correlations between marketing spend and revenue',
            response: [
                'Analyzing marketing-revenue relationship...',
                'Strong correlation found (r=0.78)',
                'Digital campaigns show 3.4x higher ROI than print',
                'Optimal budget allocation: 65% digital, 25% events, 10% other',
                'Generating predictive model for budget optimization...'
            ]
        },
        {
            query: 'Create pivot table of regional sales by product category',
            response: [
                'Creating pivot table from 4,328 sales records...',
                'Highest performing region: West (32% of total revenue)',
                'Top category by margin: Enterprise Solutions (47%)',
                'Detected anomaly: 15% drop in South region for Q3',
                'Pivot table ready with conditional formatting applied'
            ]
        }
    ];

    // Calculate total animation time needed for current query
    const calculateAnimationTime = () => {
        // Base time for query typing
        const queryLength = queries[currentQuery].query.length;
        const queryTime = queryLength * (1000 / 90) + 100; // 90 chars per second + small buffer
        
        // Time for response typing
        const responseLines = queries[currentQuery].response;
        let responseTotalTime = 0;
        
        responseLines.forEach((line, index) => {
            // Time to start this line + time to type this line
            const lineStartTime = index * 400;
            const lineTypeTime = line.length * (1000 / 90);
            responseTotalTime = Math.max(responseTotalTime, lineStartTime + lineTypeTime);
        });
        
        // Total time needed for full animation sequence
        return queryTime + 200 + responseTotalTime + 500; // query + delay + response + small buffer
    };

    // Manage the animation cycle
    useEffect(() => {
        if (isTransitioning) return;
        
        // Calculate how long this animation sequence needs
        const animationTime = calculateAnimationTime();
        
        // Start a new animation cycle
        setQueryTypingComplete(false);
        setShowResponse(false);
        setVisibleResponses([]);
        
        // Schedule the transition to next query
        const transitionTimer = setTimeout(() => {
            setIsTransitioning(true);
            
            // Quick transition to next query
            setTimeout(() => {
                setCurrentQuery((prev) => (prev + 1) % queries.length);
                setIsTransitioning(false);
            }, 100);
        }, animationTime);
        
        return () => clearTimeout(transitionTimer);
    }, [currentQuery, isTransitioning]);

    // Show response after query typing is complete
    useEffect(() => {
        if (!queryTypingComplete || isTransitioning) return;
        
        const timer = setTimeout(() => {
            setShowResponse(true);
        }, 200); // Short delay after query typing completes
        
        return () => clearTimeout(timer);
    }, [queryTypingComplete, isTransitioning]);

    // Stagger the display of response lines
    useEffect(() => {
        if (!showResponse || isTransitioning) return;
        
        const responseCount = queries[currentQuery].response.length;
        const timers: NodeJS.Timeout[] = [];
        
        // Clear visible responses first
        setVisibleResponses([]);
        
        // Add each response line with a delay
        for (let i = 0; i < responseCount; i++) {
            const timer = setTimeout(() => {
                setVisibleResponses(prev => [...prev, i]);
            }, i * 400); // 400ms delay between each line
            timers.push(timer);
        }
        
        return () => {
            timers.forEach(timer => clearTimeout(timer));
        };
    }, [showResponse, currentQuery, isTransitioning]);

    const handleGetStarted = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            router.push('/workspaces');
        } else {
            router.push('/auth');
        }
    };

    return (
        <div className="min-h-screen bg-black text-white relative">
            {/* Add the animated background with lower z-index */}
            <div className="absolute inset-0 -z-10">
                <AnimatedBackground />
            </div>

            {/* Hero Section with Enhanced Gradients */}
            <div className="relative min-h-screen">
                {/* Rich gradient background - further reduced opacity for subtlety */}
                <div className="absolute inset-0 bg-black">
                    {/* Subtle blue gradient from top left */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-700/20 via-transparent to-transparent"></div>
                    
                    {/* Subtle blue gradient from bottom right */}
                    <div className="absolute inset-0 bg-gradient-to-tl from-blue-900/25 via-blue-900/5 to-transparent"></div>
                    
                    {/* Subtle radial glow in center */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(59,130,246,0.2),transparent_70%)]"></div>
                </div>
                
                <Navigation />

                {/* Hero Content - Redesigned with left-aligned text and right-aligned window */}
                <div className="relative min-h-screen flex items-center z-20 px-8 lg:px-16">
                    <div className="container mx-auto">
                        <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
                            {/* Left side - Text content with enhanced glow */}
                            <div className="w-full lg:w-1/2 text-left">
                                <AnimatedElement direction="down" delay={0.2}>
                                    <div className="mb-4 text-sm uppercase tracking-wider text-blue-400 font-medium">
                                        <span className="inline-block border-b border-blue-400 pb-1">AI-POWERED SPREADSHEET REVOLUTION</span>
                                    </div>
                                </AnimatedElement>
                                
                                <AnimatedElement delay={0.4}>
                                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight pb-2 drop-shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-white">Your Spreadsheet, Supercharged by </span>
                                        <span className="text-blue-500 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">EDI.ai</span>
                                    </h1>
                                </AnimatedElement>
                                
                                <AnimatedElement delay={0.6}>
                                    <p className="text-xl text-blue-100/80 mb-8 max-w-xl">
                                        EDI transforms your spreadsheets with AI-powered analysis, natural language queries, and automated visualizations. Work with your data like never before.
                                    </p>
                                </AnimatedElement>

                                <AnimatedElement delay={0.7}>
                                    <div className="flex flex-wrap gap-4 mb-10">
                                        <div className="flex items-center">
                                            <svg className="w-5 h-5 text-blue-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-blue-100">Natural language queries</span>
                                        </div>
                                        <div className="flex items-center">
                                            <svg className="w-5 h-5 text-blue-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-blue-100">Instant visualizations</span>
                                        </div>
                                        <div className="flex items-center">
                                            <svg className="w-5 h-5 text-blue-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-blue-100">Predictive analytics</span>
                                        </div>
                                    </div>
                                </AnimatedElement>
                                
                                <AnimatedElement delay={1}>
                                    <div className="flex flex-col items-start gap-6">
                                        <a
                                            onClick={handleGetStarted}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-md font-medium transition-all duration-300 text-lg inline-flex items-center gap-2 group shadow-[0_0_20px_rgba(37,99,235,0.5)] hover:shadow-[0_0_30px_rgba(37,99,235,0.7)] cursor-pointer"
                                            href="#"
                                        >
                                            Try EDI.ai Now
                                            <svg 
                                                className="w-5 h-5 transform transition-transform duration-300 group-hover:translate-x-1" 
                                                fill="none" 
                                                viewBox="0 0 24 24" 
                                                stroke="currentColor"
                                            >
                                                <path 
                                                    strokeLinecap="round" 
                                                    strokeLinejoin="round" 
                                                    strokeWidth={2} 
                                                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" 
                                                />
                                            </svg>
                                        </a>
                                        <div className="mt-2 text-sm text-blue-300/70">
                                            No coding required • Instant insights • 14-day free trial
                                        </div>
                                    </div>
                                </AnimatedElement>
                            </div>
                            
                            {/* Right side - Terminal window with typing animation and responses */}
                            <div className="w-full lg:w-2/5">
                                <AnimatedElement delay={0.8}>
                                    <div className="relative rounded-lg overflow-hidden shadow-[0_0_30px_rgba(37,99,235,0.3)]">
                                        {/* Window header */}
                                        <div className="bg-gray-900 px-4 py-3 flex items-center border-b border-gray-700">
                                            <div className="flex space-x-2">
                                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                            </div>
                                            <div className="ml-4 text-xs text-gray-400">EDI.ai Console</div>
                                        </div>
                                        
                                        {/* Window content */}
                                        <div className="bg-black/80 backdrop-blur-md border border-blue-900/50 p-6 h-96 font-mono">
                                            <div className="flex items-center mb-4">
                                                <span className="text-blue-400 mr-2">$</span>
                                                <span className="text-gray-300">edi-query</span>
                                            </div>
                                            
                                            {/* Query section with fixed arrow */}
                                            <div className="flex mb-4">
                                                <span className="text-blue-400 mr-2">&gt;</span>
                                                {!isTransitioning && (
                                                    <TypeAnimation
                                                        sequence={[
                                                            queries[currentQuery].query,
                                                            () => {
                                                                // Mark query typing as complete
                                                                setQueryTypingComplete(true);
                                                            },
                                                        ]}
                                                        wrapper="div"
                                                        cursor={false}
                                                        repeat={0}
                                                        speed={90} // Fast typing speed
                                                        className="text-blue-100/90"
                                                        key={`query-${currentQuery}`} // Force re-render on query change
                                                    />
                                                )}
                                            </div>
                                            
                                            {/* Response section with fixed arrows */}
                                            <div className="border-t border-gray-800 pt-4 text-sm">
                                                {queries[currentQuery].response.map((_, index) => (
                                                    <div key={`arrow-${index}`} className="text-gray-300 mb-2 flex">
                                                        <span className="text-blue-400 mr-2">&gt;</span>
                                                        {!isTransitioning && showResponse && visibleResponses.includes(index) && (
                                                            <TypeAnimation
                                                                sequence={[
                                                                    queries[currentQuery].response[index],
                                                                    () => {}, // Callback after typing is complete
                                                                ]}
                                                                wrapper="div"
                                                                cursor={false}
                                                                repeat={0}
                                                                speed={90} // Fast typing speed
                                                                className="text-gray-300"
                                                                key={`response-${currentQuery}-${index}`}
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            
                                            {/* Blinking cursor */}
                                            <motion.div 
                                                animate={{ opacity: [1, 0, 1] }}
                                                transition={{ 
                                                    repeat: Infinity, 
                                                    duration: 1
                                                }}
                                                className="inline-block w-2 h-4 bg-blue-400 ml-1"
                                            />
                                        </div>
                                    </div>
                                </AnimatedElement>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scroll indicator */}
                <motion.div 
                    className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center"
                    animate={{ y: [0, 10, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                >
                    <span className="text-blue-400/70 text-sm mb-2">Explore</span>
                    <svg className="w-6 h-6 text-blue-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                </motion.div>
            </div>

            {/* Features Section - Now with Black Background */}
            <section id="features" className="py-24 bg-black border-t border-blue-900/20">
                <div className="max-w-7xl mx-auto px-8">
                    <AnimatedElement>
                        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-white to-blue-200">
                            Spreadsheets Reimagined
                        </h2>
                    </AnimatedElement>
                    
                    <AnimatedElement delay={0.2}>
                        <p className="text-blue-100/70 text-center mb-16 text-lg max-w-2xl mx-auto">
                            All the power of traditional spreadsheets, enhanced with AI-driven capabilities that transform how you work with data
                        </p>
                    </AnimatedElement>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[
                            {
                                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />,
                                title: "Talk to Your Spreadsheets",
                                description: "Ask questions about your data in plain English. 'Show me sales trends for Q3' or 'Find highest performing products' - no formulas required."
                            },
                            {
                                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />,
                                title: "Instant Formula Generation",
                                description: "Describe what you need and EDI writes perfect formulas for you. Complex VLOOKUPS, nested IFs, and pivot tables created in seconds."
                            },
                            {
                                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
                                title: "Automated Data Cleaning",
                                description: "EDI detects and fixes inconsistencies, removes duplicates, handles missing values, and standardizes formats automatically."
                            },
                            {
                                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />,
                                title: "One-Click Visualizations",
                                description: "Say 'Create a chart showing monthly revenue by region' and get the perfect visualization instantly, with smart formatting and insights."
                            },
                            {
                                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
                                title: "Predictive Analysis",
                                description: "EDI forecasts trends, identifies patterns, and suggests insights you might have missed. Get recommendations based on your data."
                            },
                            {
                                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />,
                                title: "Collaborative Intelligence",
                                description: "Work alongside AI that learns your data patterns and business context. Get smarter suggestions the more you use it."
                            }
                        ].map((feature, index) => (
                            <AnimatedElement 
                                key={index} 
                                delay={0.2 * (index + 2)}
                                direction={index % 2 === 0 ? 'left' : 'right'}
                            >
                                <div className="bg-black/60 backdrop-blur-sm rounded-lg p-8 border border-blue-900/30 hover:border-blue-600/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(37,99,235,0.2)] h-full group">
                                    <div className="text-blue-500 mb-4 group-hover:text-blue-400 transition-colors duration-300">
                                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            {feature.icon}
                                        </svg>
                                    </div>
                                    <h3 className="text-xl font-bold mb-3 text-white group-hover:text-blue-200 transition-colors duration-300">{feature.title}</h3>
                                    <p className="text-blue-100/70">{feature.description}</p>
                                </div>
                            </AnimatedElement>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section - Black Background */}
            <section id="how-it-works" className="py-24 bg-black/80 border-t border-blue-900/20 relative overflow-hidden">
                {/* Background grid effect */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(37,99,235,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none"></div>
                
                <div className="max-w-7xl mx-auto px-8 relative z-10">
                    <AnimatedElement>
                        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-white to-blue-200">
                            How EDI.ai Works
                        </h2>
                    </AnimatedElement>
                    
                    <AnimatedElement delay={0.2}>
                        <p className="text-blue-100/70 text-center mb-16 text-lg max-w-2xl mx-auto">
                            Our intelligent system transforms the way you interact with your data
                        </p>
                    </AnimatedElement>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            {
                                number: "01",
                                title: "Import Your Spreadsheet",
                                description: "Upload Excel files, CSVs, or connect to Google Sheets. EDI instantly understands your data structure, relationships, and formats."
                            },
                            {
                                number: "02",
                                title: "Ask Questions or Give Commands",
                                description: "Type or speak naturally: 'Show sales by region,' 'Create a forecast model,' or 'Find correlations between marketing and sales.'"
                            },
                            {
                                number: "03",
                                title: "Get Insights & Visualizations",
                                description: "EDI delivers instant analysis, creates perfect charts, generates formulas, and provides actionable recommendations."
                            }
                        ].map((step, index) => (
                            <AnimatedElement key={index} delay={0.3 * (index + 1)}>
                                <div className="relative">
                                    <div className="bg-black/40 backdrop-blur-sm border border-blue-900/30 rounded-lg p-8 pt-12 relative">
                                        <h3 className="text-2xl font-bold mb-4 text-white">{step.title}</h3>
                                        <p className="text-blue-100/70">{step.description}</p>
                                    </div>
                                    <div className="absolute -top-10 -left-6 text-6xl font-bold text-blue-500 z-10">
                                        {step.number}
                                    </div>
                                    {index < 2 && (
                                        <svg className="hidden md:block absolute top-1/2 -right-4 transform translate-x-1/2 -translate-y-1/2 text-blue-500/30 w-8 h-8 z-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                        </svg>
                                    )}
                                </div>
                            </AnimatedElement>
                        ))}
                    </div>
                </div>
            </section>

            {/* Call to Action - Pure Black Background */}
            <section className="py-24 bg-black relative border-t border-blue-900/20">
                {/* No gradients - pure black background */}
                
                <div className="max-w-4xl mx-auto px-8 text-center relative z-10">
                    <AnimatedElement>
                        <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-white to-blue-200">
                            Ready to Transform Your Spreadsheet Experience?
                        </h2>
                    </AnimatedElement>
                    
                    <AnimatedElement delay={0.2}>
                        <p className="text-xl text-blue-100/70 mb-12 max-w-2xl mx-auto">
                            Join thousands of analysts, executives, and data professionals who have revolutionized their workflow with EDI.ai.
                        </p>
                    </AnimatedElement>
                    
                    <AnimatedElement delay={0.4}>
                        <a
                            onClick={handleGetStarted}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-md font-medium transition-all duration-300 text-lg inline-flex items-center gap-3 group shadow-[0_0_20px_rgba(37,99,235,0.5)] hover:shadow-[0_0_30px_rgba(37,99,235,0.7)] cursor-pointer"
                            href="#"
                        >
                            Start Your Free Trial
                            <svg 
                                className="w-6 h-6 transform transition-transform duration-300 group-hover:translate-x-1" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                            >
                                <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" 
                                />
                            </svg>
                        </a>
                    </AnimatedElement>
                </div>
            </section>

            {/* Footer - New Design */}
            <footer className="py-16 bg-black/80 backdrop-blur-sm border-t border-blue-900/20">
                <div className="max-w-7xl mx-auto px-8">
                    {/* Contact Section */}
                    <div className="mb-16">
                        <h2 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-white to-blue-200">
                            Interested in working together,
                        </h2>
                        <h2 className="text-3xl font-bold mb-8 text-blue-100/70">
                            trying out the platform or simply learning more?
                        </h2>
                        <div className="mb-8">
                            <p className="text-gray-400 text-sm mb-2">Contact us at:</p>
                            <a href="mailto:contact@edi.ai" className="text-blue-400 hover:text-blue-300 transition-colors duration-200 flex items-center gap-2">
                                contact@edi.ai
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </a>
                        </div>
                    </div>

                    {/* Large Logo Section */}
                    <div className="flex justify-center items-center mb-16">
                        <div className="flex items-center gap-4">
                            <div 
                                className="w-24 h-24"
                                style={{
                                    background: 'linear-gradient(135deg, #ffffff 0%, #ffffff 30%, #3b82f6 60%, #1d4ed8 80%, #1e40af 100%)',
                                    mask: 'url(/logo.svg) no-repeat center',
                                    maskSize: 'contain',
                                    WebkitMask: 'url(/logo.svg) no-repeat center',
                                    WebkitMaskSize: 'contain'
                                }}
                                aria-label="EDI.ai Large Logo"
                            />
                            <span className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-200 to-white">
                                EDI.ai
                            </span>
                        </div>
                    </div>

                    {/* Navigation Links */}
                    <div className="flex justify-center mb-16">
                        <div className="flex gap-12">
                            <a href="#how-it-works" className="text-gray-400 hover:text-blue-400 transition-colors duration-200">How It Works</a>
                            <a href="#benefits" className="text-gray-400 hover:text-blue-400 transition-colors duration-200">Benefits</a>
                            <a href="#features" className="text-gray-400 hover:text-blue-400 transition-colors duration-200">Features</a>
                            <a href="#team" className="text-gray-400 hover:text-blue-400 transition-colors duration-200">Team</a>
                        </div>
                    </div>

                    {/* Bottom Section */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-blue-900/20">
                        <p className="text-gray-500 text-sm">
                            © {new Date().getFullYear()} EDI.ai Inc. All rights reserved.
                        </p>
                        <div className="flex gap-6">
                            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 transition-colors duration-200">LinkedIn</a>
                            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 transition-colors duration-200">Facebook</a>
                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 transition-colors duration-200">Twitter</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
