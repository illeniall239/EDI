'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import KnowledgeBaseSidebar, { KnowledgeBaseSidebarRef } from '@/components/KnowledgeBaseSidebar';
import KBChatInterface from '@/components/KBChatInterface';
import KBFileUpload from '@/components/KBFileUpload';
import UserProfile from '@/components/UserProfile';
import { BookOpen, Database } from 'lucide-react';

export default function KnowledgeBasePage() {
    const router = useRouter();
    const sidebarRef = useRef<KnowledgeBaseSidebarRef>(null);
    const [selectedKB, setSelectedKB] = useState<{ id: string; name: string } | null>(null);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [pendingUploadKB, setPendingUploadKB] = useState<string | null>(null);

    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push('/auth');
        }
    };

    function handleSelectChat(kbId: string, chatId: string) {
        console.log('Selected chat:', { kbId, chatId });
        setSelectedKB({ id: kbId, name: 'Loading...' }); // Will be updated by sidebar
        setSelectedChat(chatId);
    }

    function handleUploadFiles(kbId: string) {
        setPendingUploadKB(kbId);
        setShowUploadModal(true);
    }

    function handleUploadComplete() {
        // Refresh the sidebar to show new documents
        console.log('Upload complete, refreshing sidebar...');
        sidebarRef.current?.refreshDocuments();
    }

    function handleCloseUpload() {
        setShowUploadModal(false);
        setPendingUploadKB(null);
    }

    return (
        <div className="min-h-screen bg-background text-foreground relative">
            {/* Add the animated background with lower z-index */}
            <div className="absolute inset-0 -z-10">
                {/* Animated background would go here if needed */}
            </div>

            {/* Rich gradient background - reduced opacity for subtlety */}
            <div className="absolute inset-0 -z-5">
                {/* Subtle gradient from top left */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent"></div>

                {/* Subtle gradient from bottom right */}
                <div className="absolute inset-0 bg-gradient-to-tl from-primary/25 via-primary/5 to-transparent"></div>

                {/* Subtle radial glow in center */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(59,130,246,0.2),transparent_70%)]"></div>
            </div>

            <div className="h-screen flex flex-col relative z-10">
                {/* Header */}
                <header className="h-16 border-b border-border bg-card/40 backdrop-blur-sm flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <BookOpen className="w-6 h-6 text-primary" />
                        <h1 className="text-xl font-bold text-white">
                            Knowledge Bases
                        </h1>
                    </div>

                    {/* Navigation Toggle */}
                    <div className="flex items-center gap-2 bg-card/40 backdrop-blur-sm rounded-lg p-1 border border-border ml-8">
                        <button
                            onClick={() => router.push('/workspaces')}
                            className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-md font-medium transition-colors flex items-center gap-2"
                        >
                            <Database className="w-4 h-4" />
                            Workspaces
                        </button>
                        <button
                            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium flex items-center gap-2"
                        >
                            <BookOpen className="w-4 h-4" />
                            Knowledge Bases
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <UserProfile />
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-80 border-r border-border bg-card/40 backdrop-blur-sm overflow-y-auto">
                    <KnowledgeBaseSidebar
                        ref={sidebarRef}
                        onSelectChat={handleSelectChat}
                        onUploadFiles={handleUploadFiles}
                    />
                </div>

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col">
                    {selectedKB && selectedChat ? (
                        <KBChatInterface
                            kbId={selectedKB.id}
                            chatId={selectedChat}
                            kbName={selectedKB.name}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center bg-background">
                            <div className="text-center max-w-md px-6">
                                <BookOpen className="w-20 h-20 mx-auto text-primary/70 mb-6" />
                                <h2 className="text-2xl font-bold text-white mb-3">
                                    Welcome to Knowledge Bases
                                </h2>
                                <p className="text-white/80 mb-6">
                                    Create a knowledge base to get started. Upload documents, PDFs,
                                    spreadsheets, and more to build your intelligent knowledge repository.
                                </p>
                                <div className="space-y-2 text-sm text-left bg-card/40 backdrop-blur-sm rounded-lg p-4 border border-border">
                                    <p className="font-medium text-white mb-2">
                                        What you can do:
                                    </p>
                                    <ul className="space-y-1 text-white/80">
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary mt-1">•</span>
                                            <span>Upload PDFs, Word documents, and text files</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary mt-1">•</span>
                                            <span>Automatically extract tables from documents</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary mt-1">•</span>
                                            <span>Ask questions and get AI-powered answers with sources</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary mt-1">•</span>
                                            <span>Run analytics and predictions on your data</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary mt-1">•</span>
                                            <span>Organize multiple conversation threads</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Upload Modal */}
            {showUploadModal && pendingUploadKB && (
                <KBFileUpload
                    kbId={pendingUploadKB}
                    onUploadComplete={handleUploadComplete}
                    onClose={handleCloseUpload}
                />
            )}
            </div>
        </div>
    );
}
