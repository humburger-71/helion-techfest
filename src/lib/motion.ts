import type { Transition, Variants } from "framer-motion";

/** The single easing curve used across the entire experience. */
export const EASE = [0.16, 0.84, 0.24, 1] as const;

export const base: Transition = { duration: 1.1, ease: EASE };
export const slow: Transition = { duration: 1.6, ease: EASE };
export const quick: Transition = { duration: 0.5, ease: EASE };

/** Type reveal: rises from beneath a mask. */
export const riseVariants: Variants = {
  hidden: { y: "110%" },
  visible: (i: number = 0) => ({
    y: "0%",
    transition: { ...slow, delay: i * 0.08 },
  }),
};

/** Quiet fade used for supporting copy and metadata. */
export const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...base, delay: 0.15 + i * 0.07 },
  }),
};

export const viewportOnce = { once: true, amount: 0.35 } as const;
