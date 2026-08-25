/**
 * Reading the shape of a loaded sheet.
 *
 * The chat panel used to open with a slogan and three fixed example
 * questions -- "Which region has the highest total revenue?" -- regardless of
 * what was actually loaded. On a file with no `region` and no `revenue` that
 * is worse than unhelpful: clicking it sends a question about columns that do
 * not exist.
 *
 * So the opening state is derived from the data instead. The columns are real,
 * and so are the questions.
 */

/**
 * Rows out of the grid, in the shape the rest of the app speaks.
 *
 * Every producer of a sheet's rows -- the upload endpoint, the workspace
 * store, the chat's data operations -- emits one object per row keyed by
 * column name. The Univer adapter is the exception: `getAllData()` returns a
 * plain 2-D array whose first row is the header. Letting that form reach
 * state is what turned the sidebar's column list into "0, 1, 2" a second
 * after an upload, and it would have exported a CSV with numbers for column
 * headings. Anything already in record form is returned untouched.
 */
export function rowsToRecords(rows: unknown[] | undefined): Record<string, unknown>[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    if (!Array.isArray(rows[0])) return rows as Record<string, unknown>[];

    const [header, ...body] = rows as unknown[][];

    // Two columns headed the same would collide into one key and silently
    // drop a column, so the later one is numbered instead.
    const used = new Set<string>();
    const names = (header ?? []).map((cell, i) => {
        const base = cell === null || cell === undefined ? '' : String(cell).trim();
        let name = base || `Column ${i + 1}`;
        for (let n = 2; used.has(name); n += 1) name = `${base || `Column ${i + 1}`} (${n})`;
        used.add(name);
        return name;
    });

    return body.map((row) => {
        const record: Record<string, unknown> = {};
        names.forEach((name, i) => {
            record[name] = row?.[i] ?? '';
        });
        return record;
    });
}

export type ColumnKind = 'num' | 'date' | 'text';

export interface Column {
    name: string;
    kind: ColumnKind;
}

/** Rows to look at when guessing a column's type. Enough to be right, cheap. */
const SAMPLE = 40;

function looksNumeric(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    // Tolerate thousands separators and a leading currency symbol.
    return /^[-+]?[$£€]?\d[\d,]*(\.\d+)?$/.test(trimmed);
}

function looksLikeDate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    // Only the unambiguous shapes. Guessing at "01/02/03" helps nobody.
    return /^\d{4}-\d{2}(-\d{2})?$/.test(trimmed) || /^\d{4}\/\d{2}(\/\d{2})?$/.test(trimmed);
}

/** The columns of a sheet, in order, with a guess at what each holds. */
export function columnsOf(rows: unknown[] | undefined): Column[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const first = rows[0];
    if (!first || typeof first !== 'object') return [];

    const sample = rows.slice(0, SAMPLE) as Record<string, unknown>[];

    return Object.keys(first as Record<string, unknown>).map((name) => {
        let numeric = 0;
        let dates = 0;
        let seen = 0;

        for (const row of sample) {
            const value = row?.[name];
            if (value === null || value === undefined || value === '') continue;
            seen += 1;
            if (looksLikeDate(value)) dates += 1;
            else if (looksNumeric(value)) numeric += 1;
        }

        if (seen === 0) return { name, kind: 'text' as ColumnKind };
        if (dates / seen > 0.8) return { name, kind: 'date' as ColumnKind };
        if (numeric / seen > 0.8) return { name, kind: 'num' as ColumnKind };
        return { name, kind: 'text' as ColumnKind };
    });
}

/** How many distinct values a column holds across the sample. */
function distinctCount(rows: Record<string, unknown>[], name: string): number {
    const seen = new Set<unknown>();
    for (const row of rows) {
        const value = row?.[name];
        if (value !== null && value !== undefined && value !== '') seen.add(value);
        if (seen.size > SAMPLE) break;
    }
    return seen.size;
}

/** Columns that are numeric but are labels, not quantities. */
const ID_NAME = /^(id|index|idx|key|no|num|number|rank|row|serial|sku|code|year)$/i;

/**
 * The numeric column most likely to be worth totalling.
 *
 * "First numeric column" gets this wrong often enough to matter: on a sheet
 * whose first number is an id, it produces "highest total id". So identifiers
 * are skipped -- by name, and by the shape that gives them away, a column
 * whose every value is distinct.
 */
function pickMeasure(columns: Column[], sample: Record<string, unknown>[]): Column | undefined {
    const numeric = columns.filter((c) => c.kind === 'num' && !ID_NAME.test(c.name.trim()));

    const measures = numeric.filter((c) => {
        // An id is distinct on every row. A quantity repeats.
        const distinct = distinctCount(sample, c.name);
        return sample.length < 4 || distinct < sample.length;
    });

    return measures[0] ?? numeric[0];
}

/**
 * Three questions worth asking about *this* sheet.
 *
 * Picks a measure and something to group it by, preferring a text column with
 * few distinct values -- the thing a person would actually group on. Falls
 * back to questions that hold for any sheet rather than inventing columns.
 */
export function suggestionsFor(rows: unknown[] | undefined): string[] {
    const columns = columnsOf(rows);
    if (!columns.length) return [];

    const sample = (rows as Record<string, unknown>[]).slice(0, SAMPLE);

    const measure = pickMeasure(columns, sample);
    const groupable = columns
        .filter((c) => c.kind === 'text')
        .map((c) => ({ ...c, distinct: distinctCount(sample, c.name) }))
        .filter((c) => c.distinct > 1 && c.distinct <= 24)
        .sort((a, b) => a.distinct - b.distinct)[0];

    const out: string[] = [];

    if (measure && groupable) {
        out.push(`Which ${groupable.name} has the highest total ${measure.name}?`);
        out.push(`Chart total ${measure.name} by ${groupable.name} as a bar chart`);
    } else if (measure) {
        out.push(`What is the total ${measure.name}?`);
        out.push(`Chart ${measure.name} as a bar chart`);
    } else if (groupable) {
        out.push(`How many rows are there for each ${groupable.name}?`);
    }

    out.push('Remove duplicate rows');
    return out.slice(0, 3);
}
