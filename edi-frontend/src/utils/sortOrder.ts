/**
 * Which way round somebody wants a sort.
 *
 * This used to be a field the model filled in, and a small model fills it in
 * wrongly: qwen3:4b answered "sort by revenue descending" with an ascending
 * sort, reported it as done, and did the same for "highest first". The word
 * is right there in the sentence, so there is no reason to ask.
 *
 * The model's own answer is still the fallback for a sentence that does not
 * say -- "sort by revenue" on its own is genuinely ambiguous.
 */

// Kept as sources so the same alternatives can both match and be stripped.
const DESC_SRC =
    'desc(?:ending)?|z\\s*-?\\s*a|(?:high|large|big|great)(?:est)?\\s+first|' +
    'high(?:est)?\\s+to\\s+low(?:est)?|large(?:st)?\\s+to\\s+small(?:est)?|' +
    'big(?:gest)?\\s+to\\s+small(?:est)?|decreasing|newest\\s+first|' +
    'latest\\s+first|most\\s+first|reversed?';

const ASC_SRC =
    'asc(?:ending)?|a\\s*-?\\s*z|(?:low|small)(?:est)?\\s+first|' +
    'low(?:est)?\\s+to\\s+high(?:est)?|small(?:est)?\\s+to\\s+large(?:st)?|' +
    'increasing|oldest\\s+first|earliest\\s+first|least\\s+first';

const DESC_RE = new RegExp(`\\b(?:${DESC_SRC})\\b`, 'i');
const ASC_RE = new RegExp(`\\b(?:${ASC_SRC})\\b`, 'i');

// The phrase, plus the "in"/"from" that tends to introduce it and the "order"
// that tends to follow, so it can be cut out of a sentence cleanly.
const PHRASE_RE = new RegExp(
    `(?:[,;]\\s*)?(?:\\b(?:in|from)\\s+)?\\b(?:${DESC_SRC}|${ASC_SRC})\\b(?:\\s+order)?`,
    'gi',
);

/** 'desc', 'asc', or null when the sentence does not say. */
export function sortDirection(text: string): 'asc' | 'desc' | null {
    const t = text ?? '';
    // Descending first: the two sets are written to be disjoint, so
    // "smallest to largest" cannot be read as descending on account of the
    // word "largest".
    if (DESC_RE.test(t)) return 'desc';
    if (ASC_RE.test(t)) return 'asc';
    return null;
}

/**
 * The sentence with the direction taken out, so what is left can be searched
 * for the column. Without this, "sort by revenue, highest first" hands
 * "revenue, highest first" to the column resolver.
 */
export function stripSortDirection(text: string): string {
    return (text ?? '').replace(PHRASE_RE, ' ').replace(/\s{2,}/g, ' ').trim();
}
