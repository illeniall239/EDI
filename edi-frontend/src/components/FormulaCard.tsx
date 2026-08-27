"use client";

/**
 * A formula the model wrote, shown before it is applied.
 *
 * The old Formula Assistant was a modal with generate/regenerate/accept. This
 * is the same idea folded into the answer: you asked in the chat, the formula
 * comes back in the chat, and applying it is one button. What is deliberately
 * kept from the modal is the gap between writing and applying -- a formula
 * lands in cells the user picked, so a wrong one should be something you read
 * and ignore rather than something you undo.
 *
 * Two shapes, because two questions:
 *
 *   cell    one aggregate -- =SUMIF(B:B,"South",E:E). Goes in the selected
 *           cell, whichever that is when you press the button, so "put it
 *           here" is a click on the sheet and then a click on Apply.
 *   column  a per-row expression -- =E2/D2. Appends a column, writes the
 *           header, and fills down as far as the data goes.
 */

import { useState } from 'react';
import { Check, Sigma, TriangleAlert } from 'lucide-react';

import { FormulaSuggestion } from '@/types';
import { columnLabel } from '@/utils/columnRef';

interface FormulaCardProps {
    suggestion: FormulaSuggestion;
    /** Where the cursor is, read at click time rather than at render time --
     *  the user is expected to move it after reading the formula. */
    getTarget: () => { row: number; col: number } | null;
    onApply: (
        suggestion: FormulaSuggestion,
        target: { row: number; col: number } | null,
    ) => Promise<string>;
}

export default function FormulaCard({ suggestion, getTarget, onApply }: FormulaCardProps) {
    const [applying, setApplying] = useState(false);
    const [appliedTo, setAppliedTo] = useState<string | null>(suggestion.appliedTo ?? null);
    const [error, setError] = useState<string | null>(null);
    const [target, setTarget] = useState<{ row: number; col: number } | null>(null);

    const isColumn = suggestion.scope === 'column';
    const cursor = target ?? getTarget();
    const where = isColumn
        ? `a new column${suggestion.header ? `, "${suggestion.header}"` : ''}`
        : cursor
            ? `${columnLabel(cursor.col)}${cursor.row + 1}`
            : 'the selected cell';

    const apply = async () => {
        setApplying(true);
        setError(null);
        try {
            // Resolved here and handed over, so the cell named on the button
            // is the cell written to. Reading it again inside the handler is
            // how those two came apart.
            setAppliedTo(await onApply(suggestion, isColumn ? null : getTarget()));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not apply that formula');
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                <Sigma className="h-3 w-3" />
                Formula
            </div>

            <pre className="mt-1.5 overflow-x-auto rounded bg-black/50 px-2.5 py-2 font-mono text-[12px] text-emerald-200">
                {suggestion.formula}
            </pre>

            {suggestion.explanation && (
                <p className="mt-1.5 text-[12px] leading-snug text-white/55">
                    {suggestion.explanation}
                </p>
            )}

            {appliedTo ? (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-300">
                    <Check className="h-3.5 w-3.5" />
                    Applied to {appliedTo}
                </p>
            ) : (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={applying}
                        onMouseEnter={() => setTarget(getTarget())}
                        onClick={() => void apply()}
                        className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-50"
                    >
                        {applying ? 'Applying…' : `Apply to ${where}`}
                    </button>
                    {!isColumn && (
                        <span className="text-[11px] text-white/35">
                            Click a cell in the sheet to change where it goes.
                        </span>
                    )}
                    {isColumn && (
                        <span className="text-[11px] text-white/35">
                            Fills all {suggestion.rows.toLocaleString()} rows.
                        </span>
                    )}
                </div>
            )}

            {error && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-red-300">
                    <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}
