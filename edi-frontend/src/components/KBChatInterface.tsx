'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    Send,
    Loader2,
    FileText,
    BarChart3,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    BookOpen
} from 'lucide-react';
import { queryKB } from '@/utils/api';
import { ChatMessage, KBQueryResponse, KBSource } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import { API_BASE_URL } from '@/config';

interface KBChatInterfaceProps {
    kbId: string;
    chatId: string;
    kbName: string;
}

export default function KBChatInterface({
    kbId,
    chatId,
    kbName
}: KBChatInterfaceProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    async function handleSendMessage() {
        if (!input.trim() || isProcessing) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: input,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsProcessing(true);

        try {
            const response: KBQueryResponse = await queryKB(kbId, input, chatId);

            // Create assistant message
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response.response,
                timestamp: Date.now(),
                visualization: response.visualization,
            };

            // Add sources metadata (custom field)
            if (response.sources && response.sources.length > 0) {
                (assistantMessage as any).sources = response.sources;
            }

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Failed to query KB:', error);

            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to process your question. Please try again.'}`,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsProcessing(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }

    function toggleSourceExpansion(messageIndex: number) {
        setExpandedSources(prev => {
            const updated = new Set(prev);
            if (updated.has(messageIndex)) {
                updated.delete(messageIndex);
            } else {
                updated.add(messageIndex);
            }
            return updated;
        });
    }

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="p-4 border-b border-border bg-card/40 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            {kbName}
                        </h2>
                        <p className="text-xs text-white/70">
                            Ask questions about your documents and data
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <BookOpen className="w-16 h-16 text-primary/70 mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">
                            Start a Conversation
                        </h3>
                        <p className="text-sm text-white/80 max-w-md">
                            Ask questions about your uploaded documents, run analytics on your data,
                            or request predictions based on your knowledge base.
                        </p>
                        <div className="mt-6 space-y-2 w-full max-w-md">
                            <p className="text-xs font-medium text-white mb-2">
                                Try asking:
                            </p>
                            <button
                                onClick={() => setInput('What are the main topics in these documents?')}
                                className="w-full text-left px-4 py-2 bg-card/40 backdrop-blur-sm border border-border rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
                            >
                                "What are the main topics in these documents?"
                            </button>
                            <button
                                onClick={() => setInput('Summarize the key findings from page 5')}
                                className="w-full text-left px-4 py-2 bg-card/40 backdrop-blur-sm border border-border rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
                            >
                                "Summarize the key findings from page 5"
                            </button>
                            <button
                                onClick={() => setInput('What trends can you identify in the data?')}
                                className="w-full text-left px-4 py-2 bg-card/40 backdrop-blur-sm border border-border rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
                            >
                                "What trends can you identify in the data?"
                            </button>
                        </div>
                    </div>
                ) : (
                    messages.map((message, index) => (
                        <div
                            key={index}
                            className={`flex ${
                                message.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                        >
                            <div
                                className={`max-w-[80%] rounded-lg p-4 ${
                                    message.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-card/40 backdrop-blur-sm border border-border text-white'
                                }`}
                            >
                                {/* Message Content */}
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {message.content}
                                    </ReactMarkdown>
                                </div>

                                {/* Visualization */}
                                {message.visualization && (
                                    <div className="mt-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                        {message.visualization.type === 'matplotlib_figure' ? (
                                            <Image
                                                src={`${API_BASE_URL}${message.visualization.path}`}
                                                alt="Visualization"
                                                width={600}
                                                height={400}
                                                className="w-full h-auto"
                                            />
                                        ) : (
                                            <iframe
                                                src={`${API_BASE_URL}${message.visualization.path}`}
                                                className="w-full h-96"
                                                title="Interactive Visualization"
                                            />
                                        )}
                                    </div>
                                )}

                                {/* Source Citations */}
                                {message.role === 'assistant' && (message as any).sources && (
                                    <div className="mt-4 pt-4 border-t border-border">
                                        <button
                                            onClick={() => toggleSourceExpansion(index)}
                                            className="flex items-center gap-2 text-sm font-medium text-white hover:text-primary transition-colors"
                                        >
                                            <FileText className="w-4 h-4" />
                                            <span>
                                                {(message as any).sources.length}{' '}
                                                {(message as any).sources.length === 1 ? 'Source' : 'Sources'}
                                            </span>
                                            {expandedSources.has(index) ? (
                                                <ChevronUp className="w-4 h-4" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4" />
                                            )}
                                        </button>

                                        {expandedSources.has(index) && (
                                            <div className="mt-3 space-y-2">
                                                {((message as any).sources as KBSource[]).map((source) => (
                                                    <div
                                                        key={source.number}
                                                        className="p-3 bg-card/40 backdrop-blur-sm border border-border rounded-lg"
                                                    >
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-medium text-primary-foreground bg-primary px-2 py-1 rounded">
                                                                    Source {source.number}
                                                                </span>
                                                                <span className="text-xs text-white/70">
                                                                    Relevance: {(source.similarity * 100).toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-white/80 leading-relaxed">
                                                            {source.content}
                                                        </p>
                                                        {source.metadata && (
                                                            <div className="mt-2 text-xs text-muted-foreground">
                                                                {source.metadata.page && (
                                                                    <span>Page {source.metadata.page}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Timestamp */}
                                <div className="mt-2 text-xs opacity-70">
                                    {new Date(message.timestamp || Date.now()).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {/* Typing Indicator */}
                {isProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-card/40 backdrop-blur-sm border border-border rounded-lg p-4 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-sm text-white/80">
                                Searching knowledge base...
                            </span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-card/40 backdrop-blur-sm">
                <div className="flex gap-3">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question about your knowledge base..."
                        className="flex-1 px-4 py-3 border border-border rounded-lg bg-input text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                        rows={2}
                        disabled={isProcessing}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!input.trim() || isProcessing}
                        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                    >
                        {isProcessing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                    Press Enter to send, Shift+Enter for new line
                </p>
            </div>
        </div>
    );
}
