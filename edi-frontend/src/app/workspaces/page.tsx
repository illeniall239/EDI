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
}

export default function WorkspacesPage() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; workspace: Workspace | null }>({
        isOpen: false,
        workspace: null
    });
    const router = useRouter();

    useEffect(() => {
        checkUser();
        fetchWorkspaces();
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

    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push('/auth');
            return;
        }
        setUser(session.user);
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
        <div className="min-h-screen bg-black text-white relative">
            {/* Add the animated background with lower z-index */}
            <div className="absolute inset-0 -z-10">
                <AnimatedBackground />
            </div>

            {/* Rich gradient background - reduced opacity for subtlety */}
            <div className="absolute inset-0 bg-black -z-5">
                {/* Subtle blue gradient from top left */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-700/20 via-transparent to-transparent"></div>
                
                {/* Subtle blue gradient from bottom right */}
                <div className="absolute inset-0 bg-gradient-to-tl from-blue-900/25 via-blue-900/5 to-transparent"></div>
                
                {/* Subtle radial glow in center */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(59,130,246,0.2),transparent_70%)]"></div>
            </div>

            <div className="border-b border-blue-900/30">
                <div className="container mx-auto px-6 py-5 flex justify-between items-center relative z-10">
                    <AnimatedElement direction="down" delay={0.2}>
                        <h1 className="text-3xl font-bold text-white">
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-white">Workspaces</span>
                        </h1>
                    </AnimatedElement>
                    <div className="flex items-center gap-4">
                        <AnimatedElement delay={0.3}>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-all duration-300 flex items-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:shadow-[0_0_20px_rgba(37,99,235,0.6)]"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                New Workspace
                            </button>
                        </AnimatedElement>
                        <UserProfile />
                    </div>
                </div>
            </div>

            <main className="container mx-auto px-6 py-10 relative z-10">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                ) : workspaces.length === 0 ? (
                    <AnimatedElement delay={0.4}>
                        <div className="text-center py-20 bg-black/40 backdrop-blur-sm rounded-lg border border-blue-900/30">
                            <svg className="mx-auto h-16 w-16 text-blue-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            <h3 className="mt-6 text-xl font-medium text-white">No workspaces yet</h3>
                            <p className="mt-2 text-blue-100/70">Get started by clicking the "New Workspace" button in the top right.</p>
                        </div>
                    </AnimatedElement>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {workspaces.map((workspace, index) => (
                            <AnimatedElement key={workspace.id} delay={0.3 + index * 0.1} direction={index % 3 === 0 ? 'left' : index % 3 === 2 ? 'right' : 'up'}>
                                <motion.div
                                    whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
                                    onClick={() => handleWorkspaceClick(workspace.id)}
                                    className="bg-black/40 backdrop-blur-sm rounded-lg border border-blue-900/30 hover:border-blue-600/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(37,99,235,0.2)] relative overflow-hidden group cursor-pointer"
                                >
                                    {/* Blue glow effect on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/0 to-blue-600/0 group-hover:from-blue-600/5 group-hover:to-blue-600/10 transition-all duration-500"></div>
                                    
                                    <div className="p-6 relative">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h3 className="text-xl font-semibold text-white group-hover:text-blue-200 transition-colors duration-300">{workspace.name}</h3>
                                                <p className="text-blue-100/70 mt-2 line-clamp-2">{workspace.description}</p>
                                            </div>
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenDropdown(openDropdown === workspace.id ? null : workspace.id);
                                                    }}
                                                    className="p-1.5 text-blue-400/70 hover:text-blue-300 transition-colors rounded-full hover:bg-blue-900/20"
                                                >
                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                                    </svg>
                                                </button>
                                                
                                                {openDropdown === workspace.id && (
                                                    <div className="absolute right-0 top-10 w-48 bg-black/90 backdrop-blur-md rounded-md shadow-lg border border-blue-900/50 z-10 overflow-hidden">
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
                                        <div className="mt-6 text-sm text-blue-400/60 flex items-center">
                                            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            Created {new Date(workspace.created_at).toLocaleDateString()}
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
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-black/80 backdrop-blur-md rounded-lg p-8 max-w-md w-full mx-4 border border-blue-900/50 shadow-[0_0_30px_rgba(37,99,235,0.3)]"
                    >
                        <h3 className="text-xl font-semibold text-white mb-3">
                            Are you absolutely sure?
                        </h3>
                        <p className="text-blue-100/70 mb-6">
                            This action cannot be undone. This will permanently delete the workspace "{deleteConfirm.workspace.name}" and all of its data.
                        </p>
                        <div className="flex gap-4 justify-end">
                            <button
                                onClick={() => setDeleteConfirm({ isOpen: false, workspace: null })}
                                className="px-5 py-2.5 text-blue-300 hover:text-blue-100 transition-colors"
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

            <CreateWorkspaceModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onWorkspaceCreated={fetchWorkspaces}
            />
        </div>
    );
} 