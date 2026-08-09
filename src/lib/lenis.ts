import type Lenis from "lenis";

/**
 * Shared handle to the single Lenis instance created by SmoothScroll,
 * so any component (e.g. a "back to top" link) can trigger a smooth
 * scroll instead of relying on the browser's instant hash jump.
 */
export const lenisRef: { current: Lenis | null } = { current: null };
