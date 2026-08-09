"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Fade, Label, RiseLine } from "./Type";

export default function Manifesto() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const glow = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.5, 0]);
  const drift = useTransform(scrollYProgress, [0, 1], ["6%", "-6%"]);

  return (
    <section
      id="manifesto"
      ref={ref}
      className="relative overflow-hidden pt-[22vh] pb-[30vh]"
    >
      {/* off-centre light source, left aligned composition */}
      <motion.div
        style={{ opacity: glow, y: drift }}
        className="pointer-events-none absolute -left-[20vw] top-[10vh] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(circle,rgba(255,122,24,0.16),transparent_62%)] blur-3xl"
      />

      <div className="relative mx-auto grid w-full max-w-[1600px] grid-cols-12 gap-y-16 px-6 md:px-12">
        <div className="col-span-12 flex items-center gap-6 md:col-span-3">
          <Label>001 / Manifesto</Label>
          <div className="rule hidden flex-1 md:block" />
        </div>

        <div className="col-span-12 md:col-span-9">
          <h2 className="display text-[11vw] md:text-[6.8vw] lg:text-[5.8rem]">
            <RiseLine index={0}>A festival for</RiseLine>
            <RiseLine index={1}>
              <span className="text-solar">people who build</span>
            </RiseLine>
            <RiseLine index={2}>things that do not</RiseLine>
            <RiseLine index={3}>exist yet.</RiseLine>
          </h2>
        </div>

        <div className="col-span-12 md:col-start-4 md:col-span-4">
          <Fade index={0}>
            <p className="max-w-md text-sm leading-[1.9] text-white/50">
              HELION is not a hackathon with extra tracks bolted on. It is an
              ecosystem — engineering, security, play, intelligence and
              enterprise sharing one floor for seventy-two hours.
            </p>
          </Fade>
        </div>

        <div className="col-span-12 md:col-start-10 md:col-span-3">
          <Fade index={1}>
            <p className="text-sm leading-[1.9] text-white/40">
              Named for the sun: energy that arrives quietly, then changes
              everything it touches.
            </p>
          </Fade>
        </div>
      </div>
    </section>
  );
}
