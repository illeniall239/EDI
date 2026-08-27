/**
 * Restoring a sheet the way the user left it.
 *
 * Two things describe a workspace and they are not the same thing:
 *
 *   data          the rows, as records. This is what the backend queries and
 *                 what the sheet used to be rebuilt from -- correct values,
 *                 and nothing else. Column widths, number formats, bold
 *                 headers and cell colours all came back as defaults.
 *   sheet_state   a Univer workbook snapshot, which has all of that. It has
 *                 been written on every save for a long time and read on
 *                 none of them: the restore checked `Array.isArray(...)` and
 *                 a snapshot is an object, so the test never passed.
 *
 * Using the snapshot is the fix, but it cannot be used blindly. The two are
 * saved together and normally agree; they come apart when `data` is replaced
 * without the grid having caught up -- uploading a new file saves the new
 * rows while the adapter may still be holding the previous workbook. Restore
 * that snapshot and the upload appears to have done nothing.
 *
 * So the snapshot is used only when it still describes the same sheet as the
 * data beside it. When they disagree, the data wins, because the data is what
 * the backend is answering questions about.
 */

export interface SnapshotExtent {
    rows: number;
    cols: number;
}

/** Does this look like a Univer workbook snapshot rather than anything else? */
export function isWorkbookSnapshot(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const sheets = (value as Record<string, unknown>).sheets;
    return Boolean(sheets && typeof sheets === 'object' && Object.keys(sheets).length > 0);
}

/**
 * How far the written cells actually reach.
 *
 * Not rowCount/columnCount from the snapshot -- those are the size of the
 * grid, typically 1000 x 20 whatever is in it. The extent is the largest row
 * and column index that has a cell, plus one.
 */
export function snapshotExtent(snapshot: unknown): SnapshotExtent | null {
    if (!isWorkbookSnapshot(snapshot)) return null;

    const sheets = (snapshot as Record<string, any>).sheets as Record<string, any>;
    const order = (snapshot as Record<string, any>).sheetOrder as string[] | undefined;
    const first = (order && order.length && sheets[order[0]]) || sheets[Object.keys(sheets)[0]];
    const cellData = first?.cellData;
    if (!cellData || typeof cellData !== 'object') return null;

    let rows = 0;
    let cols = 0;
    for (const rowKey of Object.keys(cellData)) {
        const row = cellData[rowKey];
        if (!row || typeof row !== 'object') continue;
        const filled = Object.keys(row).filter((colKey) => {
            const cell = row[colKey];
            return cell && (cell.v !== undefined && cell.v !== null && cell.v !== '');
        });
        if (!filled.length) continue;
        rows = Math.max(rows, Number(rowKey) + 1);
        for (const colKey of filled) {
            cols = Math.max(cols, Number(colKey) + 1);
        }
    }

    return rows && cols ? { rows, cols } : null;
}

/**
 * Is this snapshot still describing the rows it is stored beside?
 *
 * Compared on shape rather than contents: reading every cell to compare it
 * with the record beside it would cost more than rebuilding the sheet, and
 * the failure being guarded against is a wholesale replacement -- a different
 * file, a different number of rows -- not a single edited cell.
 *
 * The header row is why rows is `dataRows + 1`.
 */
export function snapshotMatchesData(
    snapshot: unknown,
    dataRows: number,
    dataCols: number,
): boolean {
    const extent = snapshotExtent(snapshot);
    if (!extent) return false;
    return extent.rows === dataRows + 1 && extent.cols === dataCols;
}
