/**
 * Deterministic stand-ins for Math.random() in decorative render code.
 *
 * Calling Math.random() while rendering breaks in two ways that both show up
 * on the landing page: the server and the client pick different values, so
 * hydration mismatches, and every re-render re-rolls them, so particles
 * teleport and their animations restart. Seeding by the element's index keeps
 * a scatter looking like a scatter while making it stable and identical on
 * both sides of hydration.
 */

/** Mulberry32: small, fast, good enough for scattering dots around. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * One pseudo-random number per (index, salt) pair. Use a different salt for
 * each property so an element's x and y are not the same number.
 */
export function seededValue(index: number, salt: number = 0): number {
    return seededRandom(index * 1000 + salt * 7919)();
}
