'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';

interface CreateWorkspaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onWorkspaceCreated: () => void;
}

export default function CreateWorkspaceModal({ isOpen, onClose, onWorkspaceCreated }: CreateWorkspaceModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('No authenticated user');
            }

            const { data: workspace, error } = await supabase
                .from('workspaces')
                .insert([
                    {
                        name,
                        description,
                        user_id: session.user.id
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            onWorkspaceCreated();
            onClose();
            
            // Navigate to the new workspace
            if (workspace) {
                router.push(`/workspace/${workspace.id}`);
            }
        } catch (error: any) {
            setError(error.message || 'Failed to create workspace');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-black/80 backdrop-blur-md p-8 text-left align-middle transition-all border border-blue-900/50 shadow-[0_0_30px_rgba(37,99,235,0.3)]">
                                <Dialog.Title
                                    as="h3"
                                    className="text-xl font-semibold leading-6 text-white mb-1"
                                >
                                    Create New Workspace
                                </Dialog.Title>
                                
                                <p className="text-blue-100/70 text-sm mb-6">
                                    Create a workspace to organize your data analysis projects
                                </p>

                                <form onSubmit={handleSubmit} className="mt-4">
                                    <div className="space-y-5">
                                        <div>
                                            <label htmlFor="name" className="block text-sm font-medium text-blue-100 mb-2">
                                                Workspace Name
                                            </label>
                                            <input
                                                type="text"
                                                id="name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full px-4 py-3 bg-black/50 border border-blue-900/50 rounded-md text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                                                placeholder="My Workspace"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="description" className="block text-sm font-medium text-blue-100 mb-2">
                                                Description
                                            </label>
                                            <textarea
                                                id="description"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                rows={3}
                                                className="w-full px-4 py-3 bg-black/50 border border-blue-900/50 rounded-md text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 resize-none"
                                                placeholder="Describe your workspace..."
                                            />
                                        </div>

                                        {error && (
                                            <div className="rounded-md bg-red-900/20 p-4 border border-red-800/30">
                                                <div className="flex items-center">
                                                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                    </svg>
                                                    <p className="ml-3 text-sm text-red-400">{error}</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-8 flex justify-end space-x-4">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="bg-transparent hover:bg-blue-900/20 text-blue-300 px-6 py-2.5 rounded-md font-medium transition-all duration-200 border border-blue-900/30"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className={`px-6 py-2.5 rounded-md font-medium text-white transition-all duration-300 ${
                                                    loading
                                                        ? 'bg-blue-600/50 cursor-not-allowed'
                                                        : 'bg-blue-600 hover:bg-blue-700 shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:shadow-[0_0_20px_rgba(37,99,235,0.6)]'
                                                }`}
                                            >
                                                {loading ? 'Creating...' : 'Create Workspace'}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
} 