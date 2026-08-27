/**
 * Working out which cells "the header row" means.
 *
 * The formatting commands take a range, and until now they got one of two
 * things: an A1 reference if the message contained one, or the current
 * selection if it did not. "Make the header row bold" contains no reference
 * and is usually typed with nothing selected, so it fell back to the
 * selection's own fallback -- cell A1 -- and bolded a single cell.
 *
 * This reads the target out of the sentence instead, for the phrasings people
 * actually use. Anything it does not recognise returns null and the caller
 * keeps using the selection, which is the right answer for "make this bold".
 */

export interface TargetRange {
    startRow: number;
    startCol: number;
    numRows: number;
    numCols: number;
    /** For the confirmation message: "the header row", "the revenue column". */
    label: string;
}

const HEADER_ROW = /\b(?:the\s+)?(?:header|heading|title|first)\s+row\b|\bheaders?\b/i;
const WHOLE_SHEET = /\b(?:the\s+)?(?:whole|entire|all\s+of\s+the)\s+(?:sheet|table|data)\b|\ball\s+cells\b/i;
// The name is the word immediately before or after "column", not everything
// leading up to it -- an earlier version captured "highlight the revenue" out
// of "highlight the revenue column". A name containing a space has to be
// quoted, which is also how you would disambiguate it to a person.
const QUOTED_COLUMN = /["']([^"']+)["']\s+column\b|\bcolumn\s+["']([^"']+)["']/i;
const COLUMN_BEFORE = /\b([A-Za-z_]\w*)\s+column\b/gi;
const COLUMN_AFTER = /\bcolumn\s+([A-Za-z_]\w*)\b/gi;
const NAMED_ROW = /\brow\s+(\d+)\b/i;

export function resolveFormatTarget(
    message: string,
    headers: string[],
    dataRows: number,
): TargetRange | null {
    const text = (message || '').trim();
    if (!text || !headers.length) return null;

    if (HEADER_ROW.test(text)) {
        return {
            startRow: 0, startCol: 0, numRows: 1, numCols: headers.length,
            label: 'the header row',
        };
    }

    if (WHOLE_SHEET.test(text)) {
        return {
            startRow: 0, startCol: 0, numRows: dataRows + 1, numCols: headers.length,
            label: 'the whole sheet',
        };
    }

    const row = text.match(NAMED_ROW);
    if (row) {
        const index = parseInt(row[1], 10) - 1;
        if (index >= 0) {
            return {
                startRow: index, startCol: 0, numRows: 1, numCols: headers.length,
                label: `row ${index + 1}`,
            };
        }
    }

    // Every word that could be a column name, then the first that is one.
    //
    // Taking the first regex match instead picks the verb out of "highlight
    // column region", because "highlight column" fits "<name> column" just as
    // well as "column region" fits "column <name>". Only the headers can
    // settle which reading was meant.
    const candidates: string[] = [];
    const quoted = text.match(QUOTED_COLUMN);
    if (quoted) candidates.push(quoted[1] || quoted[2] || '');
    for (const found of text.matchAll(COLUMN_BEFORE)) candidates.push(found[1]);
    for (const found of text.matchAll(COLUMN_AFTER)) candidates.push(found[1]);

    for (const candidate of candidates) {
        const wanted = candidate.trim().toLowerCase();
        // A single letter is a spreadsheet column reference, which the caller
        // already handles and handles better -- it does not need a header to
        // match. Anything longer is a name.
        if (wanted.length > 1) {
            const index = headers.findIndex((h) => h.trim().toLowerCase() === wanted);
            if (index !== -1) {
                return {
                    // Row 1 down: the header is the column's name, not one of
                    // its values, and highlighting it with the data reads as
                    // a mistake.
                    startRow: 1, startCol: index, numRows: dataRows, numCols: 1,
                    label: `the ${headers[index]} column`,
                };
            }
        }
    }

    return null;
}
