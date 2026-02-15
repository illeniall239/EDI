'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import CreateWorkspaceModal from '@/components/CreateWorkspaceModal';
import { motion } from 'framer-motion';
import UserProfile from '@/components/UserProfile';
import AnimatedElement from '@/components/AnimatedElement';
import dynamic from 'next/dynamic';

// Import AnimatedBackground with dynamic loading to avoid SSR issues
const AnimatedBackground = dynamic(
  () => import('@/components/AnimatedBackground'),
  { ssr: false }
);

interface Workspace {
    id: string;
    name: string;
    description: string;
    created_at: string;
    workspace_type?: 'work' | 'learn';
}

export default function WorkspacesPage() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; workspace: Workspace | null }>({
        isOpen: false,
        workspace: null
    });
    const router = useRouter();

    useEffect(() => {
        checkUser();
        fetchWorkspaces();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handleClickOutside = () => {
            setOpenDropdown(null);
        };

        if (openDropdown) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [openDropdown]);

    const checkUser = async (): Promise<void> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push('/auth');
            return;
        }
        // User session is valid, continue
    };

    const fetchWorkspaces = async () => {
        try {
            const { data: workspaces, error } = await supabase
                .from('workspaces')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setWorkspaces(workspaces || []);
        } catch (error) {
            console.error('Error fetching workspaces:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleWorkspaceClick = (workspaceId: string) => {
        router.push(`/workspace/${workspaceId}`);
    };

    const handleDeleteWorkspace = async (workspace: Workspace) => {
        try {
            const { error } = await supabase
                .from('workspaces')
                .delete()
                .eq('id', workspace.id);

            if (error) throw error;

            // Remove from local state
            setWorkspaces(prev => prev.filter(w => w.id !== workspace.id));
            setDeleteConfirm({ isOpen: false, workspace: null });
        } catch (error) {
            console.error('Error deleting workspace:', error);
            alert('Failed to delete workspace. Please try again.');
        }
    };

    const openDeleteConfirm = (workspace: Workspace) => {
        setDeleteConfirm({ isOpen: true, workspace });
        setOpenDropdown(null);
    };

    return (
        <div className="min-h-screen bg-background text-foreground relative">
            {/* Add the animated background with lower z-index */}
            <div className="absolute inset-0 -z-10">
                <AnimatedBackground />
            </div>

            {/* Rich gradient background - reduced opacity for subtlety */}
            <div className="absolute inset-0 bg-background -z-5">
                {/* Subtle blue gradient from top left */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent"></div>
                
                {/* Subtle blue gradient from bottom right */}
                <div className="absolute inset-0 bg-gradient-to-tl from-primary/25 via-primary/5 to-transparent"></div>
                
                {/* Subtle radial glow in center */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(59,130,246,0.2),transparent_70%)]"></div>
            </div>

            {/* Header Section */}
            <header className="relative z-10 pt-8 pb-6">
                <div className="container mx-auto px-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-6">
                            <AnimatedElement direction="down" delay={0.2}>
                                <h1 className="text-4xl font-bold text-white">
                                    Workspaces
                                </h1>
                            </AnimatedElement>

                            {/* Mode Toggle */}
                            <AnimatedElement direction="down" delay={0.25}>
                                <div className="flex items-center gap-2 bg-card/40 backdrop-blur-sm rounded-lg p-1 border border-border">
                                    <button
                                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium"
                                    >
                                        Workspaces
                                    </button>
                                    <button
                                        onClick={() => router.push('/kb')}
                                        className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-md font-medium transition-colors"
                                    >
                                        Knowledge Bases
                                    </button>
                                </div>
                            </AnimatedElement>
                        </div>
                        <AnimatedElement direction="right" delay={0.3}>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-all duration-300 flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                New Workspace
                            </button>
                        </AnimatedElement>
                    </div>
                </div>
            </header>

            {/* Subtle divider */}
            <div className="border-b border-border relative z-10"></div>

            <main className="container mx-auto px-6 py-10 relative z-10">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : workspaces.length === 0 ? (
                    <AnimatedElement delay={0.4}>
                        <div className="text-center py-20 bg-card/40 backdrop-blur-sm rounded-lg border border-border">
                            <svg className="mx-auto h-16 w-16 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            <h3 className="mt-6 text-xl font-medium text-white">No workspaces yet</h3>
                            <p className="mt-2 text-white/80">Get started by clicking the &quot;New Workspace&quot; button in the top right.</p>
                        </div>
                    </AnimatedElement>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {workspaces.map((workspace, index) => (
                            <AnimatedElement key={workspace.id} delay={0.3 + index * 0.1} direction={index % 3 === 0 ? 'left' : index % 3 === 2 ? 'right' : 'up'}>
                                <motion.div
                                    whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
                                    onClick={() => handleWorkspaceClick(workspace.id)}
                                    className="backdrop-blur-sm rounded-lg border-0 transition-all duration-300 relative overflow-hidden group cursor-pointer bg-[linear-gradient(135deg,rgba(34,211,238,0.28),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.28),transparent_45%),linear-gradient(180deg,#000,#000)] bg-clip-padding"
                                >
                                    {/* Mode Label removed from overlay; placed next to menu dots below */}
                                    {/* Blue glow effect on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-500"></div>
                                    
                                    <div className="p-6 relative">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h3 className="text-xl font-semibold text-white group-hover:text-white transition-colors duration-300">{workspace.name}</h3>
                                                <p className="text-white/70 mt-2 line-clamp-2">{workspace.description}</p>
                                            </div>
                                            <div className="relative flex items-center gap-2">
                                                {/* Mode Label next to menu dots */}
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border border-white/20 bg-white/10 text-white/80 uppercase">
                                                    {workspace.workspace_type === 'learn' ? 'LEARN' : 'WORK'}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenDropdown(openDropdown === workspace.id ? null : workspace.id);
                                                    }}
                                                    className="p-1.5 text-primary/70 hover:text-primary transition-colors rounded-full hover:bg-primary/20"
                                                >
                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                                    </svg>
                                                </button>
                                                
                                                {openDropdown === workspace.id && (
                                                    <div className="absolute right-0 top-10 w-48 bg-popover backdrop-blur-md rounded-md shadow-lg border border-border z-10 overflow-hidden">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openDeleteConfirm(workspace);
                                                            }}
                                                            className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors"
                                                        >
                                                            Delete Workspace
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-6 text-sm text-primary/60 flex items-center">
                                            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            Created {new Date(workspace.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                        </div>
                                    </div>
                                </motion.div>
                            </AnimatedElement>
                        ))}
                    </div>
                )}
            </main>

            {/* Delete Confirmation Modal */}
            {deleteConfirm.isOpen && deleteConfirm.workspace && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-card backdrop-blur-md rounded-lg p-8 max-w-md w-full mx-4 border border-border"
                    >
                        <h3 className="text-xl font-semibold text-white mb-3">
                            Are you absolutely sure?
                        </h3>
                        <p className="text-white mb-6">
                            This action cannot be undone. This will permanently delete the workspace &quot;{deleteConfirm.workspace.name}&quot; and all of its data.
                        </p>
                        <div className="flex gap-4 justify-end">
                            <button
                                onClick={() => setDeleteConfirm({ isOpen: false, workspace: null })}
                                className="px-5 py-2.5 text-primary border border-primary/40 rounded-md hover:text-white hover:bg-primary/20 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteWorkspace(deleteConfirm.workspace!)}
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors shadow-[0_0_15px_rgba(220,38,38,0.3)] hover:shadow-[0_0_20px_rgba(220,38,38,0.5)]"
                            >
                                Delete Workspace
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Floating User Profile Button */}
            <div className="fixed bottom-6 right-6 z-50">
                <AnimatedElement direction="up" delay={0.5}>
                    <UserProfile variant="floating" />
                </AnimatedElement>
            </div>

            <CreateWorkspaceModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onWorkspaceCreated={fetchWorkspaces}
            />
        </div>
    );
} 