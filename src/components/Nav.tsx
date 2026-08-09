"use client";

import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useState } from "react";
import { EASE } from "@/lib/motion";
import { LogoLockup } from "./Logo";

const links = [
  { label: "Manifesto", href: "#manifesto" },
  { label: "Arenas", href: "#arenas" },
  { label: "Timeline", href: "#timeline" },
  { label: "Partners", href: "#partners" },
];

export default function Nav() {
  const { scrollY } = useScroll();
  const [condensed, setCondensed] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => setCondensed(v > 80));

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.2, ease: EASE, delay: 1.1 }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <motion.div
        animate={{
          backgroundColor: condensed
            ? "rgba(6,7,9,0.72)"
            : "rgba(6,7,9,0)",
          borderColor: condensed
            ? "rgba(255,255,255,0.07)"
            : "rgba(255,255,255,0)",
          paddingTop: condensed ? 14 : 26,
          paddingBottom: condensed ? 14 : 26,
        }}
        transition={{ duration: 0.7, ease: EASE }}
        className="border-b backdrop-blur-md"
      >
        <div className="mx-auto grid w-full max-w-[1600px] grid-cols-12 items-center gap-4 px-6 md:px-12">
          <a href="#top" className="col-span-6 md:col-span-3">
            <LogoLockup markClassName="h-6 w-auto md:h-7" textClassName="text-sm md:text-base" />
          </a>

          <nav className="col-span-6 hidden justify-center gap-10 md:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="label transition-colors duration-500 hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="col-span-6 flex items-center justify-end gap-6 md:col-span-3">
            <span className="label hidden lg:inline">MAR 14 — 16 / 2026</span>
            <a
              href="#register"
              className="group relative overflow-hidden rounded-full border border-white/15 px-5 py-2 font-mono text-[0.7rem] tracking-[0.24em] uppercase"
            >
              <span className="relative z-10 transition-colors duration-500 group-hover:text-void">
                Enter
              </span>
              <span className="absolute inset-0 -translate-y-full bg-solar transition-transform duration-700 ease-[cubic-bezier(0.16,0.84,0.24,1)] group-hover:translate-y-0" />
            </a>
          </div>
        </div>
      </motion.div>
    </motion.header>
  );
}
