/**
 * Filling a formula down a column, by hand.
 *
 * The model writes the expression for the first data row -- =E2/D2 -- and the
 * column needs =E3/D3 on the next one. A spreadsheet does that when you drag
 * the handle; Univer's Facade has no autofill, and setFormula() writes the
 * text it is given, so the shift happens here.
 *
 * What makes this more than a regex is what must NOT move:
 *
 *   $E$2, E$2   a row anchored with $ stays where it is put. That is the
 *               entire point of writing it that way.
 *   "Q2 2026"   text inside quotes is data, not a reference. SUMIF criteria
 *               are full of things that look like cell refs.
 *   LOG10(x)    a function name ending in digits is not column LOG row 10,
 *               and neither is ROUND(A1,2)'s second argument a reference.
 *   Sheet1!A2   the sheet part is a name; only the row after ! moves.
 */

/** Column letters, then an optional $, then the row. The pieces are kept
 *  separate so only the row can move. */
const REFERENCE = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g;

/**
 * Shift every relative row reference in a formula by `delta` rows.
 *
 * Returns the formula unchanged when there is nothing to move, which is the
 * common case for an aggregate over whole columns (=SUMIF(B:B,...)) -- those
 * have no row numbers at all and are correct on every row as written.
 */
export function shiftFormulaRows(formula: string, delta: number): string {
    if (!formula || delta === 0) return formula;

    let out = '';
    let index = 0;

    // Walk the string in quoted and unquoted stretches. Only the unquoted
    // ones are scanned for references.
    while (index < formula.length) {
        const quote = formula.indexOf('"', index);
        if (quote === -1) {
            out += shiftSegment(formula.slice(index), delta);
            break;
        }
        out += shiftSegment(formula.slice(index, quote), delta);

        // A doubled "" inside a string is an escaped quote, not the end of it.
        let close = quote + 1;
        while (close < formula.length) {
            if (formula[close] === '"') {
                if (formula[close + 1] === '"') { close += 2; continue; }
                break;
            }
            close += 1;
        }
        out += formula.slice(quote, Math.min(close + 1, formula.length));
        index = close + 1;
    }

    return out;
}

function shiftSegment(segment: string, delta: number): string {
    return segment.replace(
        REFERENCE,
        (match, colAnchor: string, letters: string, rowAnchor: string, row: string, offset: number) => {
            // Part of a longer word -- a function name, a named range, a
            // hex-ish token. `A1` is a reference; `LOG10` and `xA1` are not.
            const before = segment[offset - 1];
            if (before && /[A-Za-z0-9_.]/.test(before)) return match;

            const after = segment[offset + match.length];
            // `SUM1(` would be a function, not a reference; a trailing letter
            // or digit means the match cut a longer token in half.
            if (after && /[A-Za-z0-9_.(]/.test(after)) return match;

            // Anchored rows are anchored. Columns may be anchored too and it
            // makes no difference here, since only rows move.
            if (rowAnchor === '$') return match;

            const shifted = parseInt(row, 10) + delta;
            // Row 1 is the header and there is no row 0. A formula that would
            // point above the sheet is left alone rather than made invalid.
            if (shifted < 1) return match;
            return `${colAnchor}${letters}${rowAnchor}${shifted}`;
        },
    );
}
