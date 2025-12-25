/**
 * Duplicate Detection Utility
 *
 * Provides functions to identify duplicate rows in spreadsheet data
 * for the "Remove Duplicates" feature.
 */

/**
 * Identifies duplicate rows in a 2D array of data
 *
 * @param data 2D array from getAllData()
 * @param columns Optional: specific column indices to check (default: all columns)
 * @param keepFirst If true, keep first instance; if false, keep last
 * @returns Array of row indices to delete (in ascending order)
 *
 * @example
 * const data = [
 *   ['Alice', 25, 'NY'],
 *   ['Bob', 30, 'LA'],
 *   ['Alice', 25, 'NY'],  // Duplicate of row 0
 *   ['Charlie', 35, 'TX']
 * ];
 *
 * const duplicates = findDuplicateRows(data);
 * console.log(duplicates); // [2] - index of duplicate row
 *
 * @example Check only specific columns
 * const duplicates = findDuplicateRows(data, [0, 1]); // Check only first 2 columns
 */
export function findDuplicateRows(
  data: any[][],
  columns?: number[],
  keepFirst: boolean = true
): number[] {
  const duplicateIndices: number[] = [];
  const seen = new Map<string, number>(); // signature -> first row index

  for (let i = 0; i < data.length; i++) {
    // Create signature from all or selected columns
    const rowData = columns
      ? columns.map(col => data[i][col])
      : data[i];

    // Use JSON.stringify for simple equality check
    // Note: This works for primitive values and simple objects
    const signature = JSON.stringify(rowData);

    if (seen.has(signature)) {
      // Found duplicate
      if (keepFirst) {
        // Mark current row for deletion
        duplicateIndices.push(i);
      } else {
        // Mark previous occurrence for deletion, keep current
        const prevIndex = seen.get(signature)!;
        duplicateIndices.push(prevIndex);
        seen.set(signature, i); // Update to current
      }
    } else {
      seen.set(signature, i);
    }
  }

  // Return in ascending order for easier processing
  return duplicateIndices.sort((a, b) => a - b);
}

/**
 * Parse column specification from natural language
 *
 * @param text User message text
 * @returns Array of column indices (0-based), or undefined for all columns
 *
 * @example
 * parseColumnSpec("remove duplicates based on column A") // [0]
 * parseColumnSpec("remove duplicates in columns A and B") // [0, 1]
 * parseColumnSpec("remove duplicates") // undefined (all columns)
 */
export function parseColumnSpec(text: string): number[] | undefined {
  const lowerText = text.toLowerCase();

  // Check if specific columns are mentioned
  if (!lowerText.includes('column')) {
    return undefined; // Use all columns
  }

  const columnIndices: number[] = [];

  // Match patterns like "column A", "columns A and B", "column C, D, and E"
  const columnPattern = /column[s]?\s+([a-z](?:\s*(?:and|,)\s*[a-z])*)/gi;
  const matches = lowerText.matchAll(columnPattern);

  for (const match of matches) {
    // Extract individual column letters
    const letters = match[1].match(/[a-z]/gi);
    if (letters) {
      for (const letter of letters) {
        const index = letter.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, etc.
        if (!columnIndices.includes(index)) {
          columnIndices.push(index);
        }
      }
    }
  }

  return columnIndices.length > 0 ? columnIndices : undefined;
}
