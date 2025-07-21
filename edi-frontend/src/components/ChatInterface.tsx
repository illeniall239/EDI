import { useState, useRef, useEffect } from 'react';
import { sendQuery, cancelOperation, resetState, generateReport, downloadReport } from '@/utils/api';
import { ChatMessage } from '@/types';
import { TypeAnimation } from 'react-type-animation';
import Image from 'next/image';
import { API_BASE_URL } from '@/config';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import UserProfile from './UserProfile';
import FileUploadManager from './FileUploadManager';
import DataPreview from './DataPreview';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface ChatInterfaceProps {
    isDataLoaded: boolean;
    data?: Array<any>;
    onFileUpload?: (files: File[]) => void;
}

export default function ChatInterface({ isDataLoaded, data, onFileUpload }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showDataPreview, setShowDataPreview] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const wakeLockRef = useRef<any>(null);
    const { currentWorkspace } = useWorkspace();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Add effect to handle isDataLoaded changes
    useEffect(() => {
        if (isDataLoaded) {
            console.log('Data loaded, enabling chat input');
            setIsProcessing(false); // Ensure processing state is reset when data is loaded
        } else {
            console.log('Data not loaded, chat input disabled');
        }
    }, [isDataLoaded]);

    // Request wake lock when processing starts
    useEffect(() => {
        const requestWakeLock = async () => {
            if (isProcessing && 'wakeLock' in navigator) {
                try {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                } catch (err) {
                    console.log('Wake Lock error:', err);
                }
            }
        };

        const releaseWakeLock = async () => {
            if (wakeLockRef.current) {
                try {
                    await wakeLockRef.current.release();
                    wakeLockRef.current = null;
                } catch (err) {
                    console.log('Wake Lock release error:', err);
                }
            }
        };

        if (isProcessing) {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }

        // Cleanup
        return () => {
            releaseWakeLock();
        };
    }, [isProcessing]);

    // Handle visibility change
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.hidden && wakeLockRef.current) {
                try {
                    await wakeLockRef.current.release();
                    wakeLockRef.current = null;
                } catch (err) {
                    console.log('Wake Lock release error:', err);
                }
            } else if (!document.hidden && isProcessing) {
                try {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                } catch (err) {
                    console.log('Wake Lock error:', err);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isProcessing]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Submit attempt - isDataLoaded:', isDataLoaded, 'isProcessing:', isProcessing);
        if (!input.trim() || isProcessing || !isDataLoaded) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, 
            { role: 'user', content: userMessage },
            { role: 'assistant', content: '', isAnalyzing: true }
        ]);
        setIsProcessing(true);
        setIsAnalyzing(true);

        // Check for duplicate removal requests for debugging
        const isDuplicateRemoval = /duplicate|dedup/i.test(userMessage);
        if (isDuplicateRemoval) {
            console.log('🧹 ChatInterface: Duplicate removal request detected:', userMessage);
        }

        try {
            const response = await sendQuery(userMessage, { isVoice: isVoiceMode });
            
            // Handle data updates from the backend
            if (response.data_updated && response.updated_data) {
                console.log('📊 Data updated by backend, updating frontend data', response.updated_data);
                
                if (isDuplicateRemoval) {
                    console.log('🧹 ChatInterface: Duplicate removal response received:', response);
                    const originalRowCount = data?.length || 0;
                    console.log('🧹 Duplicate rows removed:', response.updated_data.rows < originalRowCount);
                    console.log('🧹 Original row count:', originalRowCount);
                    console.log('🧹 New row count:', response.updated_data.rows);
                }
                
                // Convert the updated data back to the expected format
                if (response.updated_data.data && Array.isArray(response.updated_data.data)) {
                    // If we have a parent callback for data updates, use it
                    const newData = response.updated_data.data;
                    if (newData.length > 0) {
                        console.log('📊 Dispatching dataUpdate event with new data');
                        
                        // This is a workaround - we're using the onFileUpload callback to update data in the parent
                        // Ideally, we would have a separate onDataUpdate callback
                        const dataUpdateEvent = new CustomEvent('dataUpdate', { 
                            detail: { data: newData } 
                        });
                        window.dispatchEvent(dataUpdateEvent);
                        
                        // After dispatching the event, log confirmation
                        console.log('✅ DataUpdate event dispatched with', newData.length, 'rows');
                    }
                }
            } else if (isDuplicateRemoval) {
                console.log('⚠️ Duplicate removal requested but no data_updated flag in response:', response);
            }
            
            // Remove the analyzing message and add the real response
            setMessages(prev => {
                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                return [...newMessages, { 
                    role: 'assistant', 
                    content: response.response,
                    isTyping: !response.visualization,
                    visualization: response.visualization ? {
                        type: response.visualization.type,
                        path: response.visualization.path
                    } : undefined
                }];
            });
        } catch (error) {
            console.error('Error in chat submission:', error);
            setMessages(prev => {
                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                return [...newMessages, {
                    role: 'assistant',
                    content: 'Sorry, I encountered an error processing your request.'
                }];
            });
        } finally {
            setIsProcessing(false);
            setIsAnalyzing(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    const handleGenerateReport = async () => {
        if (!isDataLoaded || isGeneratingReport) return;
        
        setIsGeneratingReport(true);
        try {
            const reportMeta = await generateReport({ format: 'pdf' });
            const reportBlob = await downloadReport(reportMeta.report_id);
            
            const url = window.URL.createObjectURL(reportBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `data_analysis_report_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to generate report:', error);
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handleCancel = async () => {
        try {
            await cancelOperation();
            setIsProcessing(false);
        } catch (error) {
            console.error('Failed to cancel operation:', error);
        }
    };

    const handleReset = async () => {
        try {
            await resetState();
            setMessages([]);
            setIsProcessing(false);
        } catch (error) {
            console.error('Failed to reset state:', error);
        }
    };

    const handleFileUpload = async (files: File[]) => {
        if (onFileUpload) {
            await onFileUpload(files);
        }
    };

    // Helper function to download chart
    const downloadChart = async (visualizationPath: string, visualizationType: string) => {
        try {
            const fullUrl = `${API_BASE_URL}${visualizationPath}`;
            const response = await fetch(fullUrl);
            
            if (!response.ok) {
                throw new Error('Failed to fetch chart');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Extract filename from path or create one based on type
            const filename = visualizationPath.split('/').pop() || 
                           `chart_${Date.now()}.${visualizationType === 'plotly_html' ? 'html' : 'png'}`;
            
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading chart:', error);
            alert('Failed to download chart. Please try again.');
        }
    };

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <div className={`${isSidebarOpen ? 'w-[260px]' : 'w-[72px]'} bg-white flex flex-col transition-all duration-300 border-r border-gray-200`}>
                    <div className="p-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            {isSidebarOpen && <h2 className="text-lg font-semibold text-gray-900">Files</h2>}
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
                            >
                                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isSidebarOpen ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <FileUploadManager
                            onFileUpload={handleFileUpload}
                            isExpanded={isSidebarOpen}
                        />
                    </div>

                    <div className="p-4 border-t border-gray-200">
                        <button
                            onClick={handleReset}
                            className={`${
                                isSidebarOpen 
                                    ? 'w-full h-10 gap-2' 
                                    : 'w-10 h-10'
                            } bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all duration-150 flex items-center justify-center`}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {isSidebarOpen && <span>Reset Chat</span>}
                        </button>
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col bg-emerald-900">
                    {/* Header */}
                    <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold text-gray-900">Chat</h2>
                            {currentWorkspace && (
                                <span className="text-sm text-gray-500">
                                    • {currentWorkspace.name}
                                </span>
                            )}
                        </div>
                        <UserProfile variant="light" />
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {messages.map((message, index) => (
                            <div
                                key={index}
                                className={`mb-4 ${
                                    message.role === 'user' ? 'text-right' : 'text-left'
                                }`}
                            >
                                <div
                                    className={`inline-block max-w-[70%] rounded-lg p-4 ${
                                        message.role === 'user'
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-white text-gray-900'
                                    }`}
                                >
                                    {message.isAnalyzing ? (
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <div className="w-4 h-4 rounded-full border-2 border-blue-200"></div>
                                                <div className="absolute top-0 left-0 w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-blue-700 font-medium">Analyzing</span>
                                                <span className="flex">
                                                    <span className="animate-bounce [animation-delay:0ms]">.</span>
                                                    <span className="animate-bounce [animation-delay:150ms]">.</span>
                                                    <span className="animate-bounce [animation-delay:300ms]">.</span>
                                                </span>
                                            </div>
                                        </div>
                                    ) : message.isTyping ? (
                                        <TypeAnimation
                                            sequence={[message.content]}
                                            wrapper="div"
                                            speed={90}
                                            cursor={false}
                                            repeat={1}
                                        />
                                    ) : (
                                        <>
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                className="prose prose-sm max-w-none"
                                            >
                                                {message.content}
                                            </ReactMarkdown>
                                            {message.visualization && (
                                                <div className="mt-4">
                                                    {message.visualization.type === 'matplotlib_figure' ? (
                                                        <div className="space-y-3">
                                                            <Image
                                                                src={`${API_BASE_URL}${message.visualization.path}`}
                                                                alt="Data Visualization"
                                                                width={600}
                                                                height={400}
                                                                className="rounded-lg"
                                                            />
                                                            <button
                                                                onClick={() => downloadChart(message.visualization!.path, message.visualization!.type)}
                                                                className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                                Save Chart
                                                            </button>
                                                        </div>
                                                    ) : message.visualization.type === 'plotly_html' && (
                                                        <div className="space-y-3">
                                                            <iframe
                                                                src={`${API_BASE_URL}${message.visualization.path}`}
                                                                className="w-full h-[400px] rounded-lg border-0"
                                                            />
                                                            <button
                                                                onClick={() => downloadChart(message.visualization!.path, message.visualization!.type)}
                                                                className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                                Save Chart
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-gray-200">
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={handleInputChange}
                                placeholder={isDataLoaded ? "Ask a question about your data..." : "Please upload data first..."}
                                disabled={!isDataLoaded || isProcessing}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-900 placeholder-gray-500"
                            />
                            <button
                                type="button"
                                onClick={() => setShowDataPreview(!showDataPreview)}
                                disabled={!isDataLoaded}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors duration-150"
                            >
                                Preview Data
                            </button>
                            <button
                                type="submit"
                                disabled={!isDataLoaded || isProcessing || !input.trim()}
                                className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-150"
                            >
                                {isProcessing ? (
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        <span>Processing...</span>
                                    </div>
                                ) : (
                                    "Send"
                                )}
                            </button>
                            {isProcessing && (
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-150"
                                >
                                    Cancel
                                </button>
                            )}
                        </form>
                    </div>
                </div>
            </div>

            {/* Data Preview Modal */}
            {showDataPreview && data && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-900">Data Preview</h3>
                            <button
                                onClick={() => setShowDataPreview(false)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <DataPreview data={{
                                preview: data.slice(0, 20),
                                columns: Object.keys(data[0] || {}),
                                message: `Showing first 20 rows of ${data.length} total rows`,
                                filename: currentWorkspace?.name || 'Current Data',
                                data: data.slice(0, 20)
                            }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 