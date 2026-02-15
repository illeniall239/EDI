'use client';

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
    Plus,
    ArrowLeft,
    Upload,
    MessageSquare,
    BookOpen,
    Trash2,
    Edit3,
    FileText,
    Loader2,
    Check,
    X
} from 'lucide-react';
import {
    loadKnowledgeBases,
    createKnowledgeBase,
    loadKBChats,
    createKBChat,
    deleteKnowledgeBase,
    updateKnowledgeBase,
    loadKBDocuments
} from '@/utils/api';
import { KnowledgeBase, KBChat, KBDocument } from '@/types';

interface KnowledgeBaseSidebarProps {
    onSelectChat: (kbId: string, chatId: string) => void;
    onUploadFiles: (kbId: string) => void;
}

export interface KnowledgeBaseSidebarRef {
    refreshDocuments: () => Promise<void>;
}

const KnowledgeBaseSidebar = forwardRef<KnowledgeBaseSidebarRef, KnowledgeBaseSidebarProps>(
    function KnowledgeBaseSidebar({ onSelectChat, onUploadFiles }, ref) {
    // State management
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
    const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null);
    const [kbChats, setKBChats] = useState<KBChat[]>([]);
    const [kbDocuments, setKBDocuments] = useState<KBDocument[]>([]);
    const [activeChat, setActiveChat] = useState<KBChat | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreatingKB, setIsCreatingKB] = useState(false);
    const [isCreatingChat, setIsCreatingChat] = useState(false);

    // Create KB modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKBName, setNewKBName] = useState('');
    const [newKBDescription, setNewKBDescription] = useState('');

    // Load knowledge bases on mount
    useEffect(() => {
        loadKBs();
    }, []);

    // Load chats when KB is selected
    useEffect(() => {
        if (selectedKB) {
            loadChatsAndDocuments(selectedKB.id);
        }
    }, [selectedKB]);

    // Expose refresh method to parent via ref
    useImperativeHandle(ref, () => ({
        refreshDocuments: async () => {
            if (selectedKB) {
                await loadChatsAndDocuments(selectedKB.id);
            }
        }
    }));

    async function loadKBs() {
        try {
            setIsLoading(true);
            const kbs = await loadKnowledgeBases();
            setKnowledgeBases(kbs);
        } catch (error) {
            console.error('Failed to load knowledge bases:', error);
        } finally {
            setIsLoading(false);
        }
    }

    async function loadChatsAndDocuments(kbId: string) {
        try {
            const [chats, docs] = await Promise.all([
                loadKBChats(kbId),
                loadKBDocuments(kbId)
            ]);
            setKBChats(chats);
            setKBDocuments(docs);
        } catch (error) {
            console.error('Failed to load KB data:', error);
        }
    }

    async function handleCreateKB() {
        if (!newKBName.trim()) return;

        try {
            setIsCreatingKB(true);
            const result = await createKnowledgeBase(newKBName, newKBDescription);

            // Reload knowledge bases
            await loadKBs();

            // Reset form and close modal
            setNewKBName('');
            setNewKBDescription('');
            setShowCreateModal(false);
        } catch (error) {
            console.error('Failed to create knowledge base:', error);
            alert('Failed to create knowledge base. Please try again.');
        } finally {
            setIsCreatingKB(false);
        }
    }

    async function handleCreateChat() {
        if (!selectedKB) return;

        try {
            setIsCreatingChat(true);
            const chat = await createKBChat(selectedKB.id, 'New Chat');

            // Reload chats
            await loadChatsAndDocuments(selectedKB.id);

            // Select the new chat
            setActiveChat(chat);
            onSelectChat(selectedKB.id, chat.id);
        } catch (error) {
            console.error('Failed to create chat:', error);
        } finally {
            setIsCreatingChat(false);
        }
    }

    async function handleDeleteKB(kbId: string, event: React.MouseEvent) {
        event.stopPropagation();

        if (!confirm('Are you sure you want to delete this knowledge base? This action cannot be undone.')) {
            return;
        }

        try {
            await deleteKnowledgeBase(kbId);
            await loadKBs();

            // Reset selection if deleted KB was selected
            if (selectedKB?.id === kbId) {
                setSelectedKB(null);
                setKBChats([]);
                setKBDocuments([]);
            }
        } catch (error) {
            console.error('Failed to delete knowledge base:', error);
            alert('Failed to delete knowledge base. Please try again.');
        }
    }

    function handleSelectKB(kb: KnowledgeBase) {
        setSelectedKB(kb);
        setActiveChat(null);
    }

    function handleSelectChat(chat: KBChat) {
        setActiveChat(chat);
        if (selectedKB) {
            onSelectChat(selectedKB.id, chat.id);
        }
    }

    function handleBack() {
        setSelectedKB(null);
        setKBChats([]);
        setKBDocuments([]);
        setActiveChat(null);
    }

    // Render loading state
    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-card/40 backdrop-blur-sm">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    // Level 1: Knowledge Base List
    if (!selectedKB) {
        return (
            <div className="h-full flex flex-col bg-card/40 backdrop-blur-sm">
                {/* Header */}
                <div className="p-4 border-b border-border bg-background">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            Knowledge Bases
                        </h2>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="Create Knowledge Base"
                        >
                            <Plus className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>

                {/* KB List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {knowledgeBases.length === 0 ? (
                        <div className="text-center py-12">
                            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                            <p className="text-white/70 text-sm">
                                No knowledge bases yet
                            </p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200 text-sm"
                            >
                                Create Your First KB
                            </button>
                        </div>
                    ) : (
                        knowledgeBases.map((kb) => (
                            <div
                                key={kb.id}
                                onClick={() => handleSelectKB(kb)}
                                className="p-4 bg-card/40 backdrop-blur-sm rounded-lg border border-border hover:border-primary/50 cursor-pointer transition-all duration-300 group"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-white truncate">
                                            {kb.name}
                                        </h3>
                                        {kb.description && (
                                            <p className="text-sm text-white/70 mt-1 line-clamp-2">
                                                {kb.description}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                            <span>Created {new Date(kb.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteKB(kb.id, e)}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/30 rounded transition-all"
                                        title="Delete KB"
                                    >
                                        <Trash2 className="w-4 h-4 text-red-400" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Create KB Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-card backdrop-blur-md rounded-lg max-w-md w-full p-6 border border-border">
                            <h3 className="text-lg font-semibold text-white mb-4">
                                Create Knowledge Base
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-white mb-1">
                                        Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={newKBName}
                                        onChange={(e) => setNewKBName(e.target.value)}
                                        placeholder="My Research Project"
                                        className="w-full px-3 py-2 border border-border rounded-lg bg-input text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-white mb-1">
                                        Description (optional)
                                    </label>
                                    <textarea
                                        value={newKBDescription}
                                        onChange={(e) => setNewKBDescription(e.target.value)}
                                        placeholder="A collection of research papers and data..."
                                        rows={3}
                                        className="w-full px-3 py-2 border border-border rounded-lg bg-input text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 px-4 py-2 border border-border text-white rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateKB}
                                    disabled={!newKBName.trim() || isCreatingKB}
                                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
                                >
                                    {isCreatingKB ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        'Create KB'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Level 2: Chat List for Selected KB
    return (
        <div className="h-full flex flex-col bg-card/40 backdrop-blur-sm">
            {/* Header with Back Button */}
            <div className="p-4 border-b border-border bg-background">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-primary hover:text-primary/80 mb-3 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Knowledge Bases</span>
                </button>

                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold text-white truncate">
                            {selectedKB.name}
                        </h2>
                        {selectedKB.description && (
                            <p className="text-sm text-white/70 truncate">
                                {selectedKB.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={handleCreateChat}
                        disabled={isCreatingChat}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all duration-200 text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        {isCreatingChat ? 'Creating...' : 'New Chat'}
                    </button>
                    <button
                        onClick={() => onUploadFiles(selectedKB.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 text-sm"
                    >
                        <Upload className="w-4 h-4" />
                        Upload Files
                    </button>
                </div>
            </div>

            {/* Documents Section */}
            {kbDocuments.length > 0 && (
                <div className="p-4 border-b border-border">
                    <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Documents ({kbDocuments.length})
                    </h3>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                        {kbDocuments.map((doc) => (
                            <div
                                key={doc.id}
                                className="flex items-center gap-2 text-xs text-white/70 p-2 bg-card/40 backdrop-blur-sm rounded"
                            >
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate flex-1">{doc.filename}</span>
                                {doc.processing_status === 'completed' && (
                                    <Check className="w-3 h-3 text-green-600" />
                                )}
                                {doc.processing_status === 'processing' && (
                                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                )}
                                {doc.processing_status === 'failed' && (
                                    <X className="w-3 h-3 text-red-600" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {kbChats.length === 0 ? (
                    <div className="text-center py-12">
                        <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                        <p className="text-white/70 text-sm">
                            No chats yet
                        </p>
                        <button
                            onClick={handleCreateChat}
                            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200 text-sm"
                        >
                            Start Your First Chat
                        </button>
                    </div>
                ) : (
                    kbChats.map((chat) => (
                        <div
                            key={chat.id}
                            onClick={() => handleSelectChat(chat)}
                            className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                                activeChat?.id === chat.id
                                    ? 'bg-primary/10 border-2 border-primary'
                                    : 'bg-card/40 backdrop-blur-sm border border-border hover:border-primary/50'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                <h3 className="font-medium text-white text-sm truncate flex-1">
                                    {chat.title}
                                </h3>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {new Date(chat.updated_at).toLocaleDateString()}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
});

KnowledgeBaseSidebar.displayName = 'KnowledgeBaseSidebar';

export default KnowledgeBaseSidebar;
