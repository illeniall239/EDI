/**
 * Deciding, without spending a model call, that someone wants a formula.
 *
 * Two shapes reach here:
 *
 *   "what formula sums revenue for the South region"
 *       An aggregate. The whole message is the description.
 *
 *   "add a column called unit_price that is revenue divided by units"
 *       A column with a calculation in it. This used to be handled by the
 *       add-a-column path, whose regex captures everything after "called" to
 *       the end of the line -- so it created an empty column headed
 *       `unit_price that is revenue divided by units` and suggested asking
 *       for a formula, which was advice the app could not act on. Splitting
 *       the name from the calculation is what this exists to do.
 */

export interface FormulaRequest {
    description: string;
    scope?: 'cell' | 'column';
    header?: string;
}

/** Words that separate a column's name from what should be in it. */
const DESCRIBES = String.raw`(?:that\s+is|that\s+equals?|which\s+is|equal\s+to|holding|containing|计算|=|:)`;

/** "add a column called X <that is> Y" -- the name and the calculation. */
const NAMED_COLUMN_WITH_CALC = new RegExp(
    String.raw`\b(?:add|create|insert)\s+(?:an?\s+)?(?:new\s+)?column\s+` +
    String.raw`(?:called|named|titled|labell?ed)\s+` +
    String.raw`"?([^"\n]+?)"?\s+${DESCRIBES}\s+(.+)$`,
    'i',
);

/** "add a column with revenue divided by units" -- calculation, no name. */
const COLUMN_WITH_CALC = new RegExp(
    String.raw`\b(?:add|create|insert)\s+(?:an?\s+)?(?:new\s+)?column\s+` +
    String.raw`(?:with|for|of|containing|holding)\s+(.+)$`,
    'i',
);

/** Anything that says "formula" outright. */
const MENTIONS_FORMULA = /\bformulas?\b/i;

/** Strip the conversational wrapper so the model gets the calculation. */
function tidy(description: string): string {
    return description
        .replace(/^(?:the\s+)?formula\s+(?:for|to|that)\s+/i, '')
        .replace(/\s*[.?!]+\s*$/, '')
        .trim();
}

export function parseFormulaRequest(message: string): FormulaRequest | null {
    const text = (message || '').trim();
    if (!text) return null;

    const named = text.match(NAMED_COLUMN_WITH_CALC);
    if (named) {
        const header = named[1].trim();
        const description = tidy(named[2]);
        // "called revenue that is" with nothing after it is not a calculation.
        if (header && description) {
            return { description, scope: 'column', header };
        }
    }

    const unnamed = text.match(COLUMN_WITH_CALC);
    if (unnamed) {
        const description = tidy(unnamed[1]);
        if (description) return { description, scope: 'column' };
    }

    if (MENTIONS_FORMULA.test(text)) {
        // Left without a scope: "a formula for revenue per unit" is a column
        // and "a formula for total revenue" is a cell, and the difference is
        // in the meaning rather than the wording. The model decides.
        return { description: tidy(text) };
    }

    return null;
}
