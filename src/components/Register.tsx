"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { EASE, viewportOnce } from "@/lib/motion";
import { Label, RiseLine } from "./Type";

export default function Register() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  const rise = useTransform(scrollYProgress, [0, 1], ["55%", "0%"]);
  const glow = useTransform(scrollYProgress, [0, 1], [0.15, 1]);

  return (
    <section
      id="register"
      ref={ref}
      className="relative flex min-h-[110svh] flex-col items-center justify-center overflow-hidden text-center"
    >
      {/* the sun finally rises */}
      <motion.div
        style={{ y: rise, opacity: glow }}
        className="pointer-events-none absolute inset-x-0 bottom-[-40vh] mx-auto h-[80vh] w-[120vw] rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,140,40,0.55),rgba(255,90,10,0.16)_45%,transparent_72%)] blur-2xl"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#060709_10%,transparent_55%)]" />

      <div className="relative z-10 flex flex-col items-center px-6">
        <Label>005 / Registration</Label>

        <h2 className="display mt-10 text-[15vw] leading-[0.82] md:text-[9vw] lg:text-[9rem]">
          <RiseLine index={0}>Applications</RiseLine>
          <RiseLine index={1}>are open.</RiseLine>
        </h2>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 1.3, ease: EASE, delay: 0.3 }}
          className="mt-10 max-w-md text-sm leading-[1.9] text-white/50"
        >
          1,200 places. Selection is rolling — teams and solo builders welcome
          across every arena.
        </motion.p>

        <motion.a
          href="#register"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 1.1, ease: EASE, delay: 0.45 }}
          className="group relative mt-14 overflow-hidden rounded-full border border-white/20 px-12 py-5 text-[0.72rem] tracking-[0.34em] uppercase"
        >
          <span className="relative z-10 transition-colors duration-700 group-hover:text-void">
            Apply for HELION 2026
          </span>
          <span className="absolute inset-0 -translate-y-full bg-white transition-transform duration-[900ms] ease-[cubic-bezier(0.16,0.84,0.24,1)] group-hover:translate-y-0" />
        </motion.a>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 1.2, delay: 0.6, ease: EASE }}
          className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-3"
        >
          <Label>14 — 16 March 2026</Label>
          <Label>Applications close 20 Feb</Label>
          <Label>No fee</Label>
        </motion.div>
      </div>
    </section>
  );
}
