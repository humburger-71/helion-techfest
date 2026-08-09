"use client";

import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { lenisRef } from "@/lib/lenis";
import { LogoLockup } from "./Logo";

/**
 * A quiet, link-free identity mark for the teaser hero. Lives inside the
 * hero itself (not fixed to the viewport), so it scrolls away with it
 * rather than persisting down the page. Clicking it smooth-scrolls back
 * to the top via the shared Lenis instance.
 */
export default function BrandMark() {
  const scrollToTop = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { duration: 1.2 });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.2, ease: EASE, delay: 1.1 }}
      className="absolute left-6 top-6 z-20 md:left-12 md:top-8"
    >
      <a href="#top" onClick={scrollToTop} className="flex items-center gap-4">
        <LogoLockup
          markClassName="h-6 w-auto md:h-7"
          textClassName="text-sm md:text-base"
        />
      </a>
    </motion.div>
  );
}
