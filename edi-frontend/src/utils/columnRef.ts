/**
 * Working out which column somebody meant.
 *
 * People refer to a column three ways -- by its spreadsheet letter ("column
 * C"), by its position ("column 3"), or by what the header actually says
 * ("the Rep column") -- and which one they reach for depends on the sentence,
 * not on the operation. Sorting and filtering already accepted all three;
 * deleting and hiding accepted a single letter and nothing else, so "delete
 * the Rep column" failed while "delete column I" worked. There is no reason
 * for that to differ per operation, so it lives here and every path uses it.
 */

/** The header row of a sheet as plain strings, from getAllData()'s first row. */
export function headerTexts(headers: unknown[] | undefined): string[] {
    if (!Array.isArray(headers)) return [];
    return headers.map((cell) => {
        if (cell && typeof cell === 'object') {
            const rec = cell as Record<string, unknown>;
            return String(rec.v ?? rec.m ?? '');
        }
        return String(cell ?? '');
    });
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnLabel(index: number): string {
    if (!Number.isInteger(index) || index < 0) return '?';
    let label = '';
    let n = index;
    while (n >= 0) {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
    }
    return label;
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26. -1 if it is not column letters. */
function lettersToIndex(ref: string): number {
    if (!/^[A-Za-z]{1,3}$/.test(ref)) return -1;
    let n = 0;
    for (const ch of ref.toUpperCase()) {
        n = n * 26 + (ch.charCodeAt(0) - 64);
    }
    return n - 1;
}

// Words people put around a column name that are not part of it.
const NOISE = /^(?:the|a|an|column|col|field)\s+|\s+(?:column|col|field)$/gi;

/**
 * The index of the column `ref` names, or -1.
 *
 * Tried in order: letters, a 1-based number, an exact header match, then a
 * header that contains it. Header names win over letters when they collide --
 * a sheet with a column literally headed "C" means that one, and somebody
 * typing a bare letter for the third column will still be right because the
 * letters branch runs first only when the whole reference is letters.
 */
export function resolveColumnRef(ref: string, headers: unknown[] | undefined): number {
    const raw = (ref ?? '').toString().trim();
    if (!raw) return -1;

    const names = headerTexts(headers);
    const cleaned = raw.replace(NOISE, '').trim() || raw;

    // An exact header match beats a letter reading, so that a sheet with a
    // column actually named "C" is reachable by name.
    const exact = names.findIndex((h) => h.toLowerCase() === cleaned.toLowerCase());
    if (exact !== -1) return exact;

    const asLetters = lettersToIndex(cleaned);
    if (asLetters !== -1) return asLetters;

    if (/^\d+$/.test(cleaned)) {
        const n = parseInt(cleaned, 10) - 1;
        return n >= 0 ? n : -1;
    }

    // Last resort: a header that contains what was typed. Only accept it when
    // exactly one does, because "the date column" matching both "Date" and
    // "Date Shipped" is a coin flip, and silently picking one is worse than
    // saying so.
    const partial = names
        .map((h, i) => ({ h: h.toLowerCase(), i }))
        .filter(({ h }) => h && h.includes(cleaned.toLowerCase()));
    return partial.length === 1 ? partial[0].i : -1;
}
