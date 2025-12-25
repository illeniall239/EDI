'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import { WorkspaceType } from '@/types';
import { BarChart3, BookOpen } from 'lucide-react';

interface CreateWorkspaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onWorkspaceCreated: () => void;
}

export default function CreateWorkspaceModal({ isOpen, onClose, onWorkspaceCreated }: CreateWorkspaceModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [workspaceType, setWorkspaceType] = useState<WorkspaceType>('work');
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
                        workspace_type: workspaceType,
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
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
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
                            <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-card/40 backdrop-blur-md p-8 text-left align-middle transition-all border border-border">
                                <Dialog.Title
                                    as="h3"
                                    className="text-xl font-semibold leading-6 text-white mb-1"
                                >
                                    Create New Workspace
                                </Dialog.Title>
                                
                                <p className="text-white/70 text-sm mb-6">
                                    Choose between Work mode for data analysis or Learn mode for spreadsheet education
                                </p>

                                <form onSubmit={handleSubmit} className="mt-4">
                                    <div className="space-y-5">
                                        {/* Workspace Type Selection */}
                                        <div>
                                            <label className="block text-sm font-medium text-white mb-3">
                                                Workspace Type
                                            </label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Work Mode Card */}
                                                <div
                                                    onClick={() => setWorkspaceType('work')}
                                                    className={`cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 ${
                                                        workspaceType === 'work'
                                                            ? 'border-primary bg-primary/10'
                                                            : 'border-border bg-card/20 hover:border-primary/50'
                                                    }`}
                                                >
                                                    <div className="flex items-start space-x-3">
                                                        <div className={`p-2 rounded-lg ${
                                                            workspaceType === 'work'
                                                                ? 'bg-primary/20 text-primary'
                                                                : 'bg-muted/20 text-muted-foreground'
                                                        }`}>
                                                            <BarChart3 className="w-5 h-5" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <h3 className={`font-semibold text-sm ${
                                                                workspaceType === 'work' ? 'text-white' : 'text-white/80'
                                                            }`}>
                                                                Work Mode
                                                            </h3>
                                                            <p className="text-xs text-white/60 mt-1">
                                                                Analyze real data, generate business insights, create reports
                                                            </p>
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                <span className="px-2 py-1 bg-accent/20 text-accent text-xs rounded-md">
                                                                    Any data upload
                                                                </span>
                                                                <span className="px-2 py-1 bg-accent/20 text-accent text-xs rounded-md">
                                                                    Business intelligence
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Learn Mode Card */}
                                                <div
                                                    onClick={() => setWorkspaceType('learn')}
                                                    className={`cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 ${
                                                        workspaceType === 'learn'
                                                            ? 'border-primary bg-primary/10'
                                                            : 'border-border bg-card/20 hover:border-primary/50'
                                                    }`}
                                                >
                                                    <div className="flex items-start space-x-3">
                                                        <div className={`p-2 rounded-lg ${
                                                            workspaceType === 'learn'
                                                                ? 'bg-primary/20 text-primary'
                                                                : 'bg-muted/20 text-muted-foreground'
                                                        }`}>
                                                            <BookOpen className="w-5 h-5" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <h3 className={`font-semibold text-sm ${
                                                                workspaceType === 'learn' ? 'text-white' : 'text-white/80'
                                                            }`}>
                                                                Learn Mode
                                                            </h3>
                                                            <p className="text-xs text-white/60 mt-1">
                                                                Master spreadsheet skills with guided tutorials
                                                            </p>
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                <span className="px-2 py-1 bg-accent/20 text-accent text-xs rounded-md">
                                                                    Curated datasets
                                                                </span>
                                                                <span className="px-2 py-1 bg-accent/20 text-accent text-xs rounded-md">
                                                                    Step-by-step guidance
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="name" className="block text-sm font-medium text-white mb-2">
                                                Workspace Name
                                            </label>
                                            <input
                                                type="text"
                                                id="name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full px-4 py-3 bg-card/20 border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
                                                placeholder="My Workspace"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="description" className="block text-sm font-medium text-white mb-2">
                                                Description
                                            </label>
                                            <textarea
                                                id="description"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                rows={3}
                                                className="w-full px-4 py-3 bg-card/20 border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 resize-none"
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
                                                className="bg-transparent hover:bg-accent text-primary px-6 py-2.5 rounded-md font-medium transition-all duration-200 border border-border"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className={`px-6 py-2.5 rounded-md font-medium text-black transition-all duration-300 ${
                                                    loading
                                                        ? 'bg-primary/50 cursor-not-allowed'
                                                        : 'bg-primary hover:bg-primary/90'
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