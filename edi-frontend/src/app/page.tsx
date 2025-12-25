'use client';

import Navigation from '@/components/Navigation';
import { useRouter } from 'next/navigation';
import AnimatedElement from '@/components/AnimatedElement';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Calculator, TrendingUp, Package, Users, Check, X } from 'lucide-react';
import Image from 'next/image';

// Animated Chat Component for the first card
const AnimatedChat = () => {
    const [currentConversation, setCurrentConversation] = useState(0);
    const [currentMessage, setCurrentMessage] = useState(0);
    const [showUserTyping, setShowUserTyping] = useState(false);
    const [showAiTyping, setShowAiTyping] = useState(false);

    const conversations = [
        {
            user: "What are my top 3 selling products?",
            ai: "iPhone (1,234 units), MacBook (892 units), iPad (756 units)"
        },
        {
            user: "Show me sales trends",
            ai: "Sales up 23% this quarter vs last"
        },
        {
            user: "Any unusual patterns?",
            ai: "Weekend sales spike noticed on Saturdays"
        }
    ];

    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentMessage === 0) {
                // Show user typing first
                setShowUserTyping(true);
                setTimeout(() => {
                    setShowUserTyping(false);
                    setCurrentMessage(1); // Show user message
                    setTimeout(() => {
                        setShowAiTyping(true); // Show AI typing
                        setTimeout(() => {
                            setShowAiTyping(false);
                            setCurrentMessage(2); // Show AI response
                        }, 1000);
                    }, 500);
                }, 800);
            } else if (currentMessage === 2) {
                setTimeout(() => {
                    setCurrentMessage(0);
                    setCurrentConversation((prev) => (prev + 1) % conversations.length);
                }, 2000);
            }
        }, currentMessage === 0 ? 1000 : 0);

        return () => clearTimeout(timer);
    }, [currentMessage, currentConversation, conversations.length]);

    const currentConv = conversations[currentConversation];

    return (
        <div className="h-72 w-full rounded-xl border border-border/40 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)] bg-clip-padding p-5 flex flex-col justify-end space-y-4 overflow-hidden">
            {/* User Container */}
            {(showUserTyping || currentMessage >= 1) && (
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex justify-end"
                >
                    <div className="bg-black/80 text-white text-sm px-4 py-3 rounded-lg max-w-[80%] shadow-sm border border-white/20">
                        {showUserTyping ? (
                            <div className="flex space-x-1 items-center">
                                <span className="text-white/70">User typing</span>
                                <div className="flex space-x-1 ml-2">
                                    <div className="w-1 h-1 bg-white rounded-full animate-bounce"></div>
                                    <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                    <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                </div>
                            </div>
                        ) : (
                            currentConv.user
                        )}
                    </div>
                </motion.div>
            )}

            {/* AI Container */}
            {(showAiTyping || currentMessage >= 2) && (
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex justify-start"
                >
                    <div className="bg-black/80 text-white text-sm px-4 py-3 rounded-lg shadow-sm border border-white/20">
                        {showAiTyping ? (
                            <div className="flex space-x-1 items-center">
                                <span className="text-white/70">EDI is thinking</span>
                                <div className="flex space-x-1 ml-2">
                                    <div className="w-1 h-1 bg-white rounded-full animate-bounce"></div>
                                    <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                    <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                </div>
                            </div>
                        ) : (
                            currentConv.ai
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
};

// Advanced Excel Shortcuts with Spreadsheet Demo for the second card
const SpreadsheetShortcutDemo = () => {
    const [currentDemo, setCurrentDemo] = useState(0);
    const [animationStep, setAnimationStep] = useState(0);
    const [showAiAlternative, setShowAiAlternative] = useState(false);

    const spreadsheetData = [
        ['Product', 'Sales', 'Status', 'Region'],
        ['iPhone', '$125K', 'High', 'North'],
        ['MacBook', '$89K', 'Medium', 'South'],
        ['iPad', '$156K', 'High', 'East']
    ];

    const [currentData, setCurrentData] = useState(spreadsheetData);

    const demos = [
        {
            keys: "Ctrl+Shift+L",
            description: "Auto Filter",
            aiAlternative: "or say 'filter by top performers'",
            action: 'filter'
        },
        {
            keys: "Alt+D+S", 
            description: "Data Sort",
            aiAlternative: "or say 'sort by highest revenue'",
            action: 'sort'
        },
        {
            keys: "Ctrl+1",
            description: "Format Cells",
            aiAlternative: "or say 'make this bold and green'",
            action: 'format'
        },
        {
            keys: "F4",
            description: "Repeat Action",
            aiAlternative: "or say 'apply this to all rows'",
            action: 'repeat'
        }
    ];

    useEffect(() => {
        const timer = setTimeout(() => {
            if (animationStep === 0) {
                setAnimationStep(1); // Show shortcut keys
                setTimeout(() => {
                    setAnimationStep(2); // Execute action
                    if (demos[currentDemo].action === 'sort') {
                        // Sort by sales value
                        const sorted = [...currentData];
                        const dataRows = sorted.slice(1).sort((a, b) => {
                            const aValue = parseInt(a[1].replace('$', '').replace('K', ''));
                            const bValue = parseInt(b[1].replace('$', '').replace('K', ''));
                            return bValue - aValue;
                        });
                        setCurrentData([sorted[0], ...dataRows]);
                    }
                    setTimeout(() => {
                        setShowAiAlternative(true);
                        setTimeout(() => {
                            setShowAiAlternative(false);
                            setAnimationStep(0);
                            setCurrentData(spreadsheetData); // Reset data
                            setCurrentDemo((prev) => (prev + 1) % demos.length);
                        }, 2000);
                    }, 500);
                }, 1500);
            }
        }, 1500);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDemo, animationStep, currentData, spreadsheetData]);

    const currentDemoData = demos[currentDemo];

    return (
        <div className="h-72 w-full rounded-xl border border-border/40 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)] bg-clip-padding p-4 flex flex-col overflow-hidden">
            
            {/* Top Spacer */}
            <div className="h-6"></div>
            
            {/* Mini Spreadsheet */}
            <div className="h-20 flex flex-col">
                <div className="grid grid-cols-4 gap-px bg-black/40 rounded text-xs">
                    {currentData.map((row, rowIndex) => 
                        row.map((cell, colIndex) => (
                            <div
                                key={`${rowIndex}-${colIndex}`}
                                className={`
                                    bg-black/80 text-white p-1.5 font-mono text-xs border border-white/20
                                    ${rowIndex === 0 ? 'font-semibold bg-black/90' : ''}
                                    ${animationStep === 1 && currentDemoData.action === 'filter' && rowIndex === 0 ? 'bg-blue-600/80' : ''}
                                    ${animationStep === 1 && currentDemoData.action === 'sort' && colIndex === 1 && rowIndex > 0 ? 'bg-blue-600/80' : ''}
                                    ${animationStep === 1 && currentDemoData.action === 'format' && colIndex === 2 && rowIndex > 0 ? 'bg-green-600/80 font-bold' : ''}
                                    ${rowIndex === 0 && colIndex === 0 ? 'rounded-tl' : ''}
                                    ${rowIndex === 0 && colIndex === 3 ? 'rounded-tr' : ''}
                                    ${rowIndex === currentData.length - 1 && colIndex === 0 ? 'rounded-bl' : ''}
                                    ${rowIndex === currentData.length - 1 && colIndex === 3 ? 'rounded-br' : ''}
                                `}
                            >
                                {cell}
                                {/* Filter dropdown arrows */}
                                {animationStep >= 2 && currentDemoData.action === 'filter' && rowIndex === 0 && (
                                    <span className="ml-1 text-white">▼</span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Spacer */}
            <div className="h-16"></div>

            {/* Keyboard Shortcut Display */}
            <div className="flex-1 flex items-center justify-center min-h-[40px]">
                {animationStep >= 1 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-center space-x-1"
                    >
                        {currentDemoData.keys.split('+').map((key, index, array) => (
                            <div key={key} className="flex items-center">
                                <div className="bg-black/80 text-white px-2 py-1 rounded text-xs font-mono shadow-sm border border-white/20">
                                    {key}
                                </div>
                                {index < array.length - 1 && (
                                    <span className="text-white/70 text-xs mx-0.5">+</span>
                                )}
                            </div>
                        ))}
                        <span className="text-white/80 text-xs ml-2">{currentDemoData.description}</span>
                    </motion.div>
                )}
            </div>

            {/* Spacer */}
            <div className="h-4"></div>

            {/* AI Alternative */}
            <div className="h-8 flex items-center justify-center">
                {showAiAlternative && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center"
                    >
                        <div className="text-primary text-xs font-medium">
                            {currentDemoData.aiAlternative}
                        </div>
                    </motion.div>
                )}
            </div>

        </div>
    );
};

// Automated Report Generation Animation Component for the third card
const AutomatedReportGeneration = () => {
    const [currentStep, setCurrentStep] = useState(0);
    const [showInsights, setShowInsights] = useState(false);

    const reportSteps = [
        {
            status: "Initializing...",
            description: "Setting up report template"
        },
        {
            status: "Analyzing sales data...",
            description: "Processing 1,247 records"
        },
        {
            status: "Generating charts...",
            description: "Creating visualizations"
        },
        {
            status: "Extracting insights...",
            description: "Identifying key trends"
        },
        {
            status: "Report completed!",
            description: "Ready for download"
        }
    ];

    const insights = [
        "Revenue up 23%",
        "Top performer: Q3"
    ];

    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentStep < reportSteps.length - 1) {
                setCurrentStep(prev => prev + 1);
            } else if (currentStep === reportSteps.length - 1 && !showInsights) {
                setShowInsights(true);
                setTimeout(() => {
                    setShowInsights(false);
                    setCurrentStep(0);
                }, 3000);
            }
        }, currentStep === reportSteps.length - 1 ? 3000 : 1200);

        return () => clearTimeout(timer);
    }, [currentStep, showInsights, reportSteps.length]);

    return (
        <div className="h-72 w-full rounded-xl border border-border/40 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)] bg-clip-padding p-5 flex flex-col justify-between space-y-3 overflow-hidden">
            
            {/* Document/Report Mockup */}
            <div className="flex-1 flex items-center justify-center min-h-0">
                <div className="bg-black/80 border border-white/20 rounded-lg p-4 w-full max-w-48 shadow-sm flex-shrink-0">
                    {/* Document Header */}
                    <div className="border-b border-white/20 pb-1 mb-2">
                        <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 bg-primary rounded"></div>
                            <div className="text-white text-sm font-medium">Sales Report Q4</div>
                        </div>
                    </div>

                    {/* Charts Area */}
                    <div className="space-y-1 mb-2">
                        {/* Chart 1 */}
                        <div className={`h-6 rounded transition-all duration-500 ${
                            currentStep >= 2 ? 'bg-blue-500/60' : 'bg-white/10'
                        }`}>
                            {currentStep >= 2 && (
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: '75%' }}
                                    className="h-full bg-blue-500 rounded"
                                />
                            )}
                        </div>
                        
                        {/* Chart 2 */}
                        <div className={`h-5 rounded transition-all duration-500 ${
                            currentStep >= 2 ? 'bg-green-500/60' : 'bg-white/10'
                        }`}>
                            {currentStep >= 2 && (
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: '60%' }}
                                    className="h-full bg-green-500 rounded"
                                />
                            )}
                        </div>
                    </div>

                    {/* Key Insights */}
                    {showInsights && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-1"
                        >
                            {insights.map((insight, index) => (
                                <motion.div
                                    key={insight}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.2 }}
                                    className="text-primary text-sm"
                                >
                                    • {insight}
                                </motion.div>
                            ))}
                        </motion.div>
                    )}

                    {/* Completion State */}
                    {currentStep === reportSteps.length - 1 && !showInsights && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex items-center justify-center space-x-2"
                        >
                            <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                            </div>
                            <span className="text-green-400 text-sm font-medium">Complete</span>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Status Display */}
            <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center flex-shrink-0"
            >
                <div className="text-white text-sm font-medium mb-1">
                    {reportSteps[currentStep].status}
                </div>
                <div className="text-white/70 text-sm">
                    {reportSteps[currentStep].description}
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-white/20 rounded-full h-0.5 mt-2 overflow-hidden">
                    <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentStep + 1) / reportSteps.length) * 100}%` }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
            </motion.div>
        </div>
    );
};

export default function Home() {
    const router = useRouter();
    
    const handleExploreClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const next = document.getElementById('intro');
        if (next) {
            next.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };


    return (
        <div className="min-h-screen bg-background text-foreground relative">
            <Navigation />
            {/* Combined Hero + Product Screenshot Section */}
            <div className="relative overflow-hidden">
                {/* Unified gradient background covering both hero and product areas */}
                <div className="absolute inset-0 z-0 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)]"></div>
                
                {/* Content container */}
                <div className="relative z-10 flex flex-col">
                    {/* Hero Text Area */}
                    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
                        <AnimatedElement delay={0.2}>
                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-tight drop-shadow-2xl">
                                AI-Powered Spreadsheets:
                                <br />
                                Automate, Analyze, Excel
                            </h1>
                        </AnimatedElement>
                        
                        <AnimatedElement delay={0.4}>
                            <p className="text-lg md:text-xl lg:text-2xl text-white/80 max-w-3xl mb-12 font-light drop-shadow-lg leading-relaxed">
                                EDI.ai transforms how you work with data through intelligent automation and seamless spreadsheet experience.
                            </p>
                        </AnimatedElement>
                        
                        <AnimatedElement delay={0.6}>
                            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                                <button
                                    onClick={() => router.push('/workspaces')}
                                    className="px-8 py-4 bg-white text-black text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 hover:bg-white/90"
                                >
                                    Launch EDI.ai
                                </button>
                                <button
                                    onClick={handleExploreClick}
                                    className="px-8 py-4 bg-transparent border-2 border-white/30 text-white text-lg font-semibold rounded-xl backdrop-blur-sm hover:bg-white/10 hover:border-white/50 transition-all duration-300 transform hover:scale-105"
                                >
                                    Demo
                                </button>
                            </div>
                        </AnimatedElement>
                    </div>

                    {/* Product Screenshot Area */}
                    <section id="intro" className="px-8 lg:px-16 pb-24">
                        <div className="w-full mx-auto flex flex-col items-center justify-center">
                            <AnimatedElement delay={0.2}>
                                <div className="relative w-full max-w-7xl mx-auto">
                                    {/* Browser Frame Mockup */}
                                    <div className="relative transform perspective-1000 transition-all duration-700 ease-out group">
                                        
                                        {/* Multiple Shadow Layers for Depth */}
                                        <div className="absolute inset-0 bg-black/20 rounded-2xl blur-3xl translate-y-8 scale-105 opacity-60"></div>
                                        <div className="absolute inset-0 bg-black/10 rounded-2xl blur-xl translate-y-4 scale-102 opacity-80"></div>
                                        
                                        
                                        {/* Browser Window Container */}
                                        <div className="relative bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
                                            {/* Browser Chrome - Top Bar */}
                                            <div className="bg-gray-800/90 backdrop-blur-sm border-b border-gray-700/50 px-4 py-3 flex items-center gap-3">
                                                {/* Window Controls */}
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 bg-red-500 rounded-full hover:bg-red-400 transition-colors cursor-pointer"></div>
                                                    <div className="w-3 h-3 bg-yellow-500 rounded-full hover:bg-yellow-400 transition-colors cursor-pointer"></div>
                                                    <div className="w-3 h-3 bg-green-500 rounded-full hover:bg-green-400 transition-colors cursor-pointer"></div>
                                                </div>
                                                
                                                {/* Navigation Controls */}
                                                <div className="flex items-center gap-2 ml-4">
                                                    <button className="text-gray-400 hover:text-gray-300 transition-colors p-1">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                        </svg>
                                                    </button>
                                                    <button className="text-gray-400 hover:text-gray-300 transition-colors p-1">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </button>
                                                    <button className="text-gray-400 hover:text-gray-300 transition-colors p-1 ml-1">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                    </button>
                                                </div>

                                                {/* URL Bar */}
                                                <div className="flex-1 mx-4">
                                                    <div className="bg-gray-700/50 rounded-lg px-4 py-2 border border-gray-600/30 flex items-center gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                            </svg>
                                                            <span className="text-gray-300 text-sm font-mono">app.edi.ai</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Browser Menu */}
                                                <button className="text-gray-400 hover:text-gray-300 transition-colors p-1">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                                    </svg>
                                                </button>
                                            </div>

                                            {/* Tab Bar */}
                                            <div className="bg-gray-800/60 backdrop-blur-sm border-b border-gray-700/30 px-4 py-2">
                                                <div className="flex items-center gap-2">
                                                    {/* Active Tab */}
                                                    <div className="bg-gray-700/80 border border-gray-600/30 rounded-t-lg px-4 py-2 flex items-center gap-2 min-w-0">
                                                        <div className="w-4 h-4 bg-primary rounded-sm flex-shrink-0"></div>
                                                        <span className="text-gray-200 text-sm font-medium truncate">EDI.ai - AI Spreadsheets</span>
                                                        <button className="text-gray-400 hover:text-gray-300 transition-colors ml-2">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    
                                                    {/* New Tab Button */}
                                                    <button className="text-gray-400 hover:text-gray-300 transition-colors p-2">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Screenshot Content Area */}
                                            <div className="relative bg-white overflow-hidden">
                                                <Image
                                                    src="/product_ss.png"
                                                    alt="EDI.ai Product Screenshot"
                                                    width={1200}
                                                    height={800}
                                                    className="w-full h-auto"
                                                />
                                                
                                                {/* Subtle Inner Glow */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/5 via-transparent to-black/5 pointer-events-none"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </AnimatedElement>
                        </div>
                    </section>
                </div>
            </div>

            {/* Features Section - Redesigned */}
            <section id="features" className="py-24 bg-card/40 border-t border-border">
                <div className="max-w-7xl mx-auto px-8">
                    <div className="flex items-start justify-between gap-6 mb-10">
                        <div>
                            <AnimatedElement>
                                <h2 className="text-4xl md:text-5xl font-bold text-white mb-3 text-left">Spreadsheets Reimagined</h2>
                            </AnimatedElement>
                            <AnimatedElement delay={0.15}>
                                <p className="text-white/70 text-left text-lg max-w-3xl">Intelligent, fast, and familiar — EDI is the best way to work with data.</p>
                            </AnimatedElement>
                        </div>
                        <AnimatedElement delay={0.25}>
                            <a href="#how-it-works" className="hidden md:inline-block bg-white text-black rounded-full px-4 py-2 text-sm font-medium shadow-sm hover:shadow transition-all">See more features</a>
                        </AnimatedElement>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            {
                                title: 'Talk to Your Data',
                                description: 'Simply ask questions in plain English. EDI.ai instantly understands and delivers answers.'
                            },
                            {
                                title: 'Think Excel, But Better',
                                description: 'Familiar Excel interface with AI superpowers. All your shortcuts still work.'
                            },
                            {
                                title: 'Smart Automation',
                                description: 'AI handles complex calculations and creates reports. You focus on making strategic decisions.'
                            }
                        ].map((card, index) => (
                            <AnimatedElement key={index} delay={0.15 * (index + 1)}>
                                <div className="relative rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden shadow-xl hover:shadow-2xl transition-all h-full flex flex-col">
                                    <div className="p-8 flex-shrink-0">
                                        <h3 className="text-2xl font-semibold text-white mb-2">{card.title}</h3>
                                        <p className="text-white/70">{card.description}</p>
                                    </div>
                                    <div className="px-8 pb-8 flex-grow flex items-end">
                                        {index === 0 ? (
                                            <AnimatedChat />
                                        ) : index === 1 ? (
                                            <SpreadsheetShortcutDemo />
                                        ) : index === 2 ? (
                                            <AutomatedReportGeneration />
                                        ) : (
                                            <div className="h-72 w-full rounded-xl border border-border/40 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)] bg-clip-padding"></div>
                                        )}
                                    </div>
                                </div>
                            </AnimatedElement>
                        ))}
                    </div>
                </div>
            </section>

            {/* Use Cases/Industries Section */}
            <section className="py-24 bg-card/40 border-t border-border">
                <div className="max-w-7xl mx-auto px-8">
                    <div className="text-center mb-16">
                        <AnimatedElement>
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                                Perfect For Every Business
                            </h2>
                        </AnimatedElement>
                        <AnimatedElement delay={0.2}>
                            <p className="text-white/70 text-lg max-w-2xl mx-auto">
                                EDI.ai transforms data analysis across industries with AI-powered insights
                            </p>
                        </AnimatedElement>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            {
                                icon: <Calculator className="w-12 h-12 text-white mx-auto" />,
                                title: "Finance & Accounting",
                                useCase: "Budget analysis, financial forecasting, expense tracking",
                                beforeAfter: "From manual pivot tables → AI-powered financial insights",
                                example: "Ask: 'Which departments are over budget?'"
                            },
                            {
                                icon: <TrendingUp className="w-12 h-12 text-white mx-auto" />,
                                title: "Sales & Marketing",
                                useCase: "Campaign performance, lead analysis, revenue forecasting",
                                beforeAfter: "From complex VLOOKUP formulas → Natural language queries",
                                example: "Ask: 'Show me top performing campaigns by region'"
                            },
                            {
                                icon: <Package className="w-12 h-12 text-white mx-auto" />,
                                title: "Operations & Supply Chain", 
                                useCase: "Inventory management, supplier analysis, process optimization",
                                beforeAfter: "From manual reporting → Automated insights",
                                example: "Ask: 'Which suppliers have the best delivery times?'"
                            },
                            {
                                icon: <Users className="w-12 h-12 text-white mx-auto" />,
                                title: "HR & People Analytics",
                                useCase: "Performance tracking, workforce planning, compensation analysis", 
                                beforeAfter: "From static reports → Dynamic people insights",
                                example: "Ask: 'Show me retention rates by department'"
                            }
                        ].map((industry, index) => (
                            <AnimatedElement key={index} delay={0.1 * (index + 1)}>
                                <div className="bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)] bg-clip-padding backdrop-blur-sm border border-border/60 rounded-xl p-6 hover:shadow-2xl transition-all duration-300 transform hover:scale-105 h-full flex flex-col">
                                    <div className="text-4xl mb-4 text-center">{industry.icon}</div>
                                    <h3 className="text-xl font-semibold text-white mb-3 text-center">{industry.title}</h3>
                                    <p className="text-white/70 text-sm mb-4 flex-grow">{industry.useCase}</p>
                                    <div className="space-y-3">
                                        <div className="bg-black/40 rounded-lg p-3 border border-white/10">
                                            <p className="text-xs text-white/60 mb-1">Transformation:</p>
                                            <p className="text-xs text-primary font-medium">{industry.beforeAfter}</p>
                                        </div>
                                        <div className="bg-black rounded-lg p-3 border border-white/10">
                                            <p className="text-xs text-white/60 mb-1">Example:</p>
                                            <p className="text-xs text-white italic">&quot;{industry.example}&quot;</p>
                                        </div>
                                    </div>
                                </div>
                            </AnimatedElement>
                        ))}
                    </div>
                    
                    {/* Talk to Us Button */}
                    <AnimatedElement delay={0.6}>
                        <div className="text-center mt-16">
                            <button 
                                onClick={() => window.open('mailto:contact@edi.ai', '_blank')}
                                className="inline-flex items-center px-8 py-3 bg-primary hover:bg-primary/80 text-black font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 hover:shadow-xl border border-primary/20"
                            >
                                Talk to Us
                            </button>
                        </div>
                    </AnimatedElement>
                </div>
            </section>

            {/* Comparison Section */}
            <section className="py-24 bg-background border-t border-border">
                <div className="max-w-7xl mx-auto px-8">
                    <div className="text-center mb-16">
                        <AnimatedElement>
                            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                                Why Choose EDI.ai Over Traditional Spreadsheets?
                            </h2>
                        </AnimatedElement>
                        <AnimatedElement delay={0.2}>
                            <p className="text-white/70 text-lg max-w-3xl mx-auto">
                                See the difference AI makes in your daily workflow
                            </p>
                        </AnimatedElement>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
                        {/* Traditional Spreadsheets Side */}
                        <AnimatedElement delay={0.3}>
                            <div className="bg-black border border-white/20 rounded-xl p-8">
                                <h3 className="text-2xl font-bold text-white mb-6 text-center">Traditional Spreadsheets</h3>
                                <div className="space-y-4">
                                    {[
                                        { label: "Complex Formulas", desc: "=VLOOKUP(A2,Sheet2!A:C,3,FALSE)" },
                                        { label: "Manual Analysis", desc: "Hours of manual pivot tables" },
                                        { label: "Chart Creation", desc: "10+ clicks to create basic charts" },
                                        { label: "Error Prone", desc: "#N/A, #REF! errors everywhere" },
                                        { label: "Limited Collaboration", desc: "Email spreadsheets back and forth" },
                                        { label: "Steep Learning Curve", desc: "Master complex formulas and functions" }
                                    ].map((item, index) => (
                                        <div key={index} className="flex items-start space-x-3">
                                            <X className="text-white mt-1 w-4 h-4" />
                                            <div>
                                                <p className="text-white font-medium text-sm">{item.label}</p>
                                                <p className="text-white/60 text-xs">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </AnimatedElement>

                        {/* EDI.ai Side */}
                        <AnimatedElement delay={0.4}>
                            <div className="bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)] bg-clip-padding border border-primary/20 rounded-xl p-8">
                                <h3 className="text-2xl font-bold text-primary mb-6 text-center">EDI.ai</h3>
                                <div className="space-y-4">
                                    {[
                                        { label: "Natural Language", desc: "\"Show me customer purchase history\"" },
                                        { label: "Instant AI Insights", desc: "AI-powered analysis in seconds" },
                                        { label: "Auto-Generated Charts", desc: "Charts created automatically from questions" },
                                        { label: "Error-Free", desc: "AI validates and corrects automatically" },
                                        { label: "Real-Time Collaboration", desc: "Collaborative AI workspace" },
                                        { label: "Zero Learning Curve", desc: "Just speak naturally to your data" }
                                    ].map((item, index) => (
                                        <div key={index} className="flex items-start space-x-3">
                                            <Check className="text-white mt-1 w-4 h-4" />
                                            <div>
                                                <p className="text-white font-medium text-sm">{item.label}</p>
                                                <p className="text-white/60 text-xs">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </AnimatedElement>
                    </div>
                </div>
            </section>

            {/* User Reviews Section */}
            <section className="py-20 bg-background border-t border-border">
                <div className="text-center mb-12">
                    <AnimatedElement>
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            What Our Users Say
                        </h2>
                    </AnimatedElement>
                    <AnimatedElement delay={0.2}>
                        <p className="text-white/70 text-lg max-w-2xl mx-auto">
                            Join thousands of professionals who trust EDI.ai for their data analysis
                        </p>
                    </AnimatedElement>
                </div>

                {/* Full Viewport Marquee Container */}
                <div className="overflow-hidden w-full">
                    <div className="flex w-max animate-marquee">
                            {(() => {
                                const reviews = [
                                    {
                                        name: "Sarah Chen",
                                        title: "Senior Business Analyst",
                                        company: "TechCorp",
                                        review: "EDI.ai transformed how I analyze data. What used to take hours of complex formulas now takes minutes with simple questions.",
                                        rating: 5
                                    },
                                    {
                                        name: "Michael Rodriguez",
                                        title: "Finance Director",
                                        company: "Growth Industries",
                                        review: "The natural language queries are game-changing. I can ask 'which departments are over budget?' and get instant insights.",
                                        rating: 5
                                    },
                                    {
                                        name: "Emily Watson",
                                        title: "Operations Manager",
                                        company: "LogiFlow",
                                        review: "Automated report generation saved our team 20+ hours per week. The AI insights are incredibly accurate.",
                                        rating: 5
                                    },
                                    {
                                        name: "David Kim",
                                        title: "Data Scientist",
                                        company: "Analytics Plus",
                                        review: "Finally, a tool that bridges the gap between technical analysis and business understanding. Absolutely love it!",
                                        rating: 5
                                    },
                                    {
                                        name: "Lisa Thompson",
                                        title: "Marketing Director",
                                        company: "Brand Dynamics",
                                        review: "Campaign performance analysis has never been easier. EDI.ai turns complex data into actionable insights instantly.",
                                        rating: 5
                                    },
                                    {
                                        name: "James Wilson",
                                        title: "Supply Chain Manager",
                                        company: "Global Logistics",
                                        review: "Inventory optimization became effortless. The AI understands our supply chain better than traditional tools ever could.",
                                        rating: 5
                                    }
                                ];

                                type Review = { name: string; title: string; company: string; review: string; rating: number };
                                const renderCard = (review: Review, key: string | number) => (
                                    <div key={key} className="relative flex-shrink-0 w-80 h-auto min-h-96 bg-black backdrop-blur-sm border border-border/60 rounded-xl p-8 flex flex-col overflow-hidden group transition-all duration-500 hover:shadow-xl hover:shadow-primary/10">
                                        {/* Gradient overlay with smooth fade/scale on hover */}
                                        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out">
                                            <div className="absolute -inset-8 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)] transform scale-110 group-hover:scale-100 transition-transform duration-700 ease-out"></div>
                                        </div>
                                        {/* User Info and Rating on Top */}
                                        <div className="relative z-10 flex items-center justify-between mb-4">
                                            <div className="flex items-center">
                                                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center mr-3">
                                                    <span className="text-primary font-semibold text-sm">
                                                        {review.name.split(' ').map((n: string) => n[0]).join('')}
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="text-white font-semibold text-sm">{review.name}</h4>
                                                    <p className="text-white/60 text-xs">{review.title}</p>
                                                    <p className="text-white/40 text-xs">{review.company}</p>
                                                </div>
                                            </div>
                                            {/* Star Rating */}
                                            <div className="flex">
                                                {[...Array(review.rating)].map((_, i) => (
                                                    <span key={i} className="text-yellow-400 text-sm">★</span>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        {/* Review Text Below */}
                                        <p className="relative z-10 text-white/80 text-base leading-relaxed flex-grow flex items-center">
                                            &quot;{review.review}&quot;
                                        </p>
                                    </div>
                                );

                                return (
                                    <>
                                        <div className="flex space-x-6">
                                            {reviews.map((review, index) => renderCard(review, index))}
                                        </div>
                                        <div className="flex space-x-6 ml-6" aria-hidden="true">
                                            {reviews.map((review, index) => renderCard(review, `dup-${index}`))}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
            </section>

            {/* Footer */}
            <footer className="w-full relative overflow-hidden bg-card/40 border-t border-border">
                
                <div className="relative z-10 container mx-auto px-8 py-20 text-center">
                    {/* Main footer content */}
                    <div className="mb-12">
                        <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                            Ready to Transform Your Data?
                        </h3>
                        <p className="text-white mb-8 max-w-2xl mx-auto">
                            Join thousands of users who are already revolutionizing their data analysis with EDI.ai&apos;s powerful AI-driven insights.
                        </p>
                        
                        {/* Subscribe form */}
                        <form className="flex flex-col sm:flex-row gap-4 w-full max-w-lg mx-auto mb-8">
                            <input 
                                type="email" 
                                placeholder="Enter your email address"
                                className="flex-1 px-6 py-3 rounded-lg bg-card/50 border border-border text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                            <button 
                                type="submit" 
                                className="px-8 py-3 rounded-lg bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-black font-semibold transition-all duration-200 transform hover:scale-105"
                            >
                                Subscribe
                            </button>
                        </form>
                    </div>
                    
                    {/* Bottom section */}
                    <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                        {/* Copyright */}
                        <div className="text-white text-sm">
                            © {new Date().getFullYear()} EDI.ai. All rights reserved.
                        </div>
                        
                        {/* Made with love */}
                        <div className="flex items-center gap-2 text-white text-sm">
                            <span>Made with</span>
                            <span className="text-red-500">❤️</span>
                            <span>from</span>
                            <span className="text-green-400">🇵🇰</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
