"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const WORDS = [
  "Hackathon",
  "Capture The Flag",
  "Game Development",
  "Robotics",
  "Artificial Intelligence",
  "Workshops",
  "Speaker Sessions",
  "Startup Showcase",
  "Sponsor Expo",
  "Community",
];

/** Full-bleed drifting index of the ecosystem. Scroll-linked, never looping fast. */
export default function Ecosystem() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const xA = useTransform(scrollYProgress, [0, 1], ["4%", "-22%"]);
  const xB = useTransform(scrollYProgress, [0, 1], ["-18%", "6%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.8, 1], [0, 1, 1, 0]);

  return (
    <div ref={ref} className="relative overflow-hidden py-6">
      <motion.div style={{ opacity }} className="space-y-3">
        <motion.div
          style={{ x: xA }}
          className="flex w-max gap-10 whitespace-nowrap"
        >
          {WORDS.map((w) => (
            <span
              key={w}
              className="display text-[7vw] text-white/[0.07] md:text-[4.6vw]"
            >
              {w}
            </span>
          ))}
        </motion.div>
        <motion.div
          style={{ x: xB }}
          className="flex w-max gap-10 whitespace-nowrap"
        >
          {[...WORDS].reverse().map((w) => (
            <span
              key={w}
              className="display text-[7vw] text-white/[0.05] md:text-[4.6vw]"
            >
              {w}
            </span>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
