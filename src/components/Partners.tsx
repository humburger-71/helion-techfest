"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { EASE, viewportOnce } from "@/lib/motion";
import { Label } from "./Type";

const PARTNERS = [
  "AURELIA",
  "NORTHWIND",
  "KERNEL",
  "OBSIDIAN",
  "VANTA LABS",
  "MERIDIAN",
  "HALCYON",
  "STRATUM",
];

/** Split layout: statement left, spotlight-lit partner grid right. */
export default function Partners() {
  const grid = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const x = useSpring(mx, { stiffness: 180, damping: 30, mass: 0.5 });
  const y = useSpring(my, { stiffness: 180, damping: 30, mass: 0.5 });
  const spotlight = useTransform(
    [x, y],
    ([lx, ly]: number[]) =>
      `radial-gradient(240px circle at ${lx}px ${ly}px, rgba(255,255,255,0.9), transparent 70%)`,
  );

  return (
    <section id="partners" className="relative py-[20vh]">
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-12 gap-y-16 px-6 md:px-12">
        <div className="col-span-12 md:col-span-4">
          <Label>004 / Partners</Label>
          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 1.3, ease: EASE }}
            className="display mt-10 text-[12vw] md:text-[4.6vw] lg:text-[4.2rem]"
          >
            Built with
            <br />
            those who
            <br />
            build.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={viewportOnce}
            transition={{ duration: 1.2, ease: EASE, delay: 0.2 }}
            className="mt-10 max-w-xs text-sm leading-[1.9] text-white/40"
          >
            The expo floor runs the length of the festival. Partners bring
            problems, not booths.
          </motion.p>
          <a
            href="mailto:partners@helion.fest"
            className="mt-10 inline-block border-b border-white/20 pb-1 text-sm text-white/70 transition-colors duration-500 hover:border-solar hover:text-white"
          >
            Request the partnership deck
          </a>
        </div>

        <div
          ref={grid}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            mx.set(e.clientX - r.left);
            my.set(e.clientY - r.top);
          }}
          onPointerLeave={() => {
            mx.set(-9999);
            my.set(-9999);
          }}
          className="relative col-span-12 md:col-span-7 md:col-start-6"
        >
          <div className="grid grid-cols-2 border-l border-t border-white/[0.07] md:grid-cols-3">
            {PARTNERS.map((p, i) => (
              <motion.div
                key={p}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.9, ease: EASE, delay: i * 0.04 }}
                className="flex aspect-[16/9] items-center justify-center border-b border-r border-white/[0.07] text-[0.72rem] tracking-[0.3em] text-white/25"
              >
                {p}
              </motion.div>
            ))}
          </div>

          {/* the spotlight reveals the marks at full brightness */}
          <motion.div
            aria-hidden
            style={{ WebkitMaskImage: spotlight, maskImage: spotlight }}
            className="pointer-events-none absolute inset-0"
          >
            <div className="grid grid-cols-2 border-l border-t border-white/20 md:grid-cols-3">
              {PARTNERS.map((p) => (
                <div
                  key={p}
                  className="flex aspect-[16/9] items-center justify-center border-b border-r border-white/20 text-[0.72rem] tracking-[0.3em] text-white"
                >
                  {p}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
