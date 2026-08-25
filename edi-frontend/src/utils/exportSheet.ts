/**
 * Saving the open sheet back out as a file.
 *
 * The navbar has offered "Export File" since long before this existed, but
 * nothing ever passed it an exporter, so the submenu opened onto an empty box.
 * This is the missing half.
 *
 * CSV only, deliberately. A real .xlsx is a zip of XML parts and needs a
 * library; `xlsx` was removed from this project as an unused dependency and is
 * not worth bringing back for one menu item when Excel, Sheets and Numbers all
 * open CSV directly.
 */

/**
 * One field, quoted only when it has to be.
 *
 * RFC 4180: a field containing a comma, a quote or a newline is wrapped in
 * quotes, and quotes inside it are doubled. Getting this wrong is how an
 * address column silently becomes three columns.
 */
function field(value: unknown): string {
    if (value === null || value === undefined) return '';

    const text = value instanceof Date ? value.toISOString() : String(value);
    if (!/[",\r\n]/.test(text)) return text;

    return `"${text.replace(/"/g, '""')}"`;
}

/** The rows as CSV text, with the header taken from the first row's keys. */
export function toCSV(rows: Record<string, unknown>[]): string {
    if (!rows.length) return '';

    // Later rows can carry columns the first one does not -- a computed column
    // added part way down -- so the header is the union, in first-seen order.
    const columns: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        for (const key of Object.keys(row ?? {})) {
            if (!seen.has(key)) {
                seen.add(key);
                columns.push(key);
            }
        }
    }

    const lines = [columns.map(field).join(',')];
    for (const row of rows) {
        lines.push(columns.map((key) => field(row?.[key])).join(','));
    }

    // CRLF, because Excel on Windows treats a bare LF as one long line.
    return lines.join('\r\n');
}

/** `sales.xlsx` -> `sales.csv`; anything unnamed -> `sheet.csv`. */
function csvName(filename?: string): string {
    const base = (filename ?? '').replace(/\.[^./\\]+$/, '').trim();
    return `${base || 'sheet'}.csv`;
}

/** Hand the CSV to the browser as a download. */
export function downloadCSV(rows: Record<string, unknown>[], filename?: string): void {
    // A BOM, so Excel reads the file as UTF-8 rather than the system codepage
    // and does not mangle every accented name in it.
    const blob = new Blob(['\ufeff', toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = csvName(filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}
