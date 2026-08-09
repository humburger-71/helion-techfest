"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { frame, cancelFrame } from "framer-motion";
import { lenisRef } from "@/lib/lenis";

/**
 * Lenis driven by Framer Motion's frameloop so scroll-linked motion values
 * and the smoothed scroll position resolve on the same tick.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      touchMultiplier: 1.4,
    });
    lenisRef.current = lenis;

    const update = ({ timestamp }: { timestamp: number }) =>
      lenis.raf(timestamp);

    frame.update(update, true);

    return () => {
      cancelFrame(update);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return null;
}
