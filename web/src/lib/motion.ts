// GSAP animations run in JS, so the CSS reduced-motion rule in globals.css
// doesn't reach them — they check this instead.
export const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
