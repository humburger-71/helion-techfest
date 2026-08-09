"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { EASE } from "@/lib/motion";
import { LogoMark } from "./Logo";
import BrandMark from "./BrandMark";

const SolarField = dynamic(() => import("./SolarField"), { ssr: false });

function ArrowUpRight({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M4.5 11.5L11.5 4.5M11.5 4.5H5.5M11.5 4.5V10.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowDown({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M8 3V13M8 13L4 9M8 13L12 9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Thin orbit rings + scattered nodes framing the mark, echoing an orrery. */
function OrbitField() {
  return (
    <svg
      viewBox="0 0 600 600"
      className="absolute inset-0 h-full w-full"
      fill="none"
    >
      <ellipse
        cx="300"
        cy="300"
        rx="280"
        ry="210"
        stroke="rgba(255,122,24,0.22)"
        strokeWidth="1"
      />
      <ellipse
        cx="300"
        cy="300"
        rx="230"
        ry="270"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      <circle
        cx="300"
        cy="300"
        r="150"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
        strokeDasharray="2 6"
      />
      <circle cx="580" cy="120" r="3" fill="var(--color-solar)" />
      <circle cx="60" cy="360" r="2" fill="rgba(255,255,255,0.5)" />
      <circle cx="470" cy="520" r="2.5" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

export default function Hero({
  variant = "full",
  tagline = "A hackathon for those who don't wait for the future. They build it.",
}: {
  /** "full" is the existing production hero — untouched by default.
   *  "teaser" trims CTAs/scroll-cue for the in-the-works landing page. */
  variant?: "full" | "teaser";
  tagline?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const fieldY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const fieldOpacity = useTransform(scrollYProgress, [0, 0.9], [0.55, 0]);
  const typeY = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"]);
  const typeOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  return (
    <section
      id="top"
      ref={ref}
      className="relative flex min-h-[100svh] items-center overflow-hidden pt-36 pb-20 md:pt-32"
    >
      {variant === "teaser" && <BrandMark />}

      <motion.div
        style={{ y: fieldY, opacity: fieldOpacity }}
        className="absolute inset-0"
      >
        <SolarField
          showPlasma={variant === "full"}
          particleCount={variant === "full" ? 1500 : 90}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_40%,transparent_20%,rgba(6,7,9,0.65)_70%,#060709_100%)]" />
      </motion.div>

      {/* arcing horizon line, bottom-left */}
      <svg
        className="pointer-events-none absolute -bottom-32 -left-32 h-[560px] w-[560px] opacity-70 md:-bottom-40 md:-left-40 md:h-[760px] md:w-[760px]"
        viewBox="0 0 560 560"
        fill="none"
      >
        <circle
          cx="0"
          cy="560"
          r="420"
          stroke="var(--color-solar)"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
      </svg>

      <motion.div
        style={{ y: typeY, opacity: typeOpacity }}
        className="relative z-10 mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-16 px-6 md:grid-cols-2 md:gap-10 md:px-12"
      >
        {/* left column — copy */}
        <div className="flex flex-col items-start text-left">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.1, ease: EASE, delay: 0.3 }}
            className="flex items-center gap-3"
          >
            <span className="h-px w-8 bg-gradient-to-r from-solar to-transparent" />
            <span className="h-1 w-1 rounded-full bg-solar" />
            <span className="label">Build Beyond</span>
          </motion.div>

          <h1 className="display mt-7 text-[16vw] leading-[0.84] sm:text-[13vw] md:text-[8vw] lg:text-[6.4rem]">
            <span className="block overflow-hidden">
              <motion.span
                initial={{ y: "115%" }}
                animate={{ y: "0%" }}
                transition={{ duration: 1.6, ease: EASE, delay: 0.15 }}
                className="block"
              >
                HELION
              </motion.span>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: EASE, delay: 0.75 }}
            className="mt-7 max-w-sm text-xs uppercase tracking-[0.14em] text-white/50 sm:text-sm"
          >
            {tagline}
          </motion.p>

          {variant === "full" && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, ease: EASE, delay: 0.95 }}
              className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-6"
            >
              <a
                href="#register"
                className="group inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-mono text-[0.7rem] uppercase tracking-[0.24em] text-white transition-colors duration-500 hover:border-solar hover:text-solar"
              >
                Explore Helion
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>

              <a
                href="#manifesto"
                className="group inline-flex items-center gap-3 text-white/55 transition-colors duration-500 hover:text-white"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 transition-colors duration-500 group-hover:border-solar">
                  <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
                </span>
                <span className="label !text-current">Scroll to discover</span>
              </a>
            </motion.div>
          )}
        </div>

        {/* right column — mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, ease: EASE, delay: 0.4 }}
          className="relative mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center md:max-w-[560px]"
        >
          <div className="pointer-events-none absolute h-2/3 w-2/3 rounded-full bg-[radial-gradient(circle,rgba(255,122,24,0.28)_0%,transparent_70%)] blur-2xl" />
          <OrbitField />
          <LogoMark className="relative z-10 h-[62%] w-auto drop-shadow-[0_0_60px_rgba(255,122,24,0.35)]" />

          <div className="absolute bottom-2 right-0 flex items-center gap-2 text-right md:bottom-6">
            <span className="label !text-white/35">
              12.9716° N&nbsp;&nbsp;77.5946° E
            </span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
