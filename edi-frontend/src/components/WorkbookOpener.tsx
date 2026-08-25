'use client';

import { Plus, FileSpreadsheet, Clock } from 'lucide-react';
import type { WorkspaceSummary } from '@/utils/api';

interface WorkbookOpenerProps {
    workbooks: WorkspaceSummary[];
    onOpen: (id: string, name: string) => void;
    onCreate: () => void;
    /** Absent on a first visit, when there is nothing to go back to. */
    onDismiss?: () => void;
    busy?: boolean;
}

/** "3 minutes ago", "yesterday" -- enough to recognise which one you want. */
function when(iso?: string | null): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';

    const seconds = Math.max(0, (Date.now() - then) / 1000);
    if (seconds < 90) return 'just now';

    const minutes = seconds / 60;
    if (minutes < 60) return `${Math.round(minutes)} min ago`;

    const hours = minutes / 60;
    if (hours < 24) return `${Math.round(hours)}h ago`;

    const days = Math.round(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(iso).toLocaleDateString();
}

function subtitle(book: WorkspaceSummary): string {
    const parts: string[] = [];
    if (book.filename) parts.push(book.filename);
    // Null on stores that cannot count rows cheaply; say nothing rather than 0.
    if (typeof book.row_count === 'number') {
        parts.push(`${book.row_count.toLocaleString()} ${book.row_count === 1 ? 'row' : 'rows'}`);
    }
    if (!parts.length) parts.push('Empty');
    return parts.join(' · ');
}

export default function WorkbookOpener({
    workbooks,
    onOpen,
    onCreate,
    onDismiss,
    busy = false
}: WorkbookOpenerProps) {
    const [recent, ...rest] = workbooks;

    return (
        <div className="min-h-screen bg-background text-white overflow-y-auto">
            <div className="mx-auto max-w-2xl px-6 py-16">
                <div className="edi-rise">
                    <div className="edi-kicker mb-3">Welcome back</div>
                    <h1 className="text-3xl font-bold tracking-tight mb-1">Your workbooks</h1>
                    <p className="text-white/50 text-sm mb-10">
                        Pick up where you left off, or start something new.
                    </p>
                </div>

                {recent && (
                    <div className="edi-rise" style={{ animationDelay: '80ms' }}>
                        <div className="edi-kicker mb-3">Most recent</div>
                        <button
                            onClick={() => onOpen(recent.id, recent.name)}
                            disabled={busy}
                            className="w-full text-left rounded-xl p-5 mb-10 transition-colors
                                       bg-white/[0.04] hover:bg-white/[0.07]
                                       border border-[color:var(--edi-hairline)]
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                                    <FileSpreadsheet className="w-5 h-5 text-white/70" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-base font-medium truncate">{recent.name}</div>
                                    <div className="text-xs text-white/45 truncate mt-0.5">
                                        {subtitle(recent)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-white/35 flex-shrink-0">
                                    <Clock className="w-3.5 h-3.5" />
                                    {when(recent.last_modified)}
                                </div>
                            </div>
                        </button>
                    </div>
                )}

                {rest.length > 0 && (
                    <div className="edi-rise" style={{ animationDelay: '150ms' }}>
                        <div className="edi-kicker mb-3">All workbooks</div>
                        <div className="rounded-xl border border-[color:var(--edi-hairline)] overflow-hidden mb-10">
                            {rest.map((book, i) => (
                                <button
                                    key={book.id}
                                    onClick={() => onOpen(book.id, book.name)}
                                    disabled={busy}
                                    className={`w-full text-left px-5 py-4 flex items-center gap-4 transition-colors
                                                hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed
                                                ${i > 0 ? 'border-t border-[color:var(--edi-hairline-soft)]' : ''}`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm truncate">{book.name}</div>
                                        <div className="text-xs text-white/40 truncate mt-0.5">
                                            {subtitle(book)}
                                        </div>
                                    </div>
                                    <div className="text-xs text-white/30 flex-shrink-0">
                                        {when(book.last_modified)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="edi-rise flex items-center gap-3" style={{ animationDelay: '220ms' }}>
                    <button
                        onClick={onCreate}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                                   bg-white/[0.06] hover:bg-white/[0.1]
                                   border border-[color:var(--edi-hairline)]
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-4 h-4" />
                        New workbook
                    </button>

                    {onDismiss && (
                        <button
                            onClick={onDismiss}
                            disabled={busy}
                            className="px-4 py-2.5 rounded-lg text-sm text-white/50 hover:text-white/80
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
