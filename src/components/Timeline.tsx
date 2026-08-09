"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Label } from "./Type";

const DAYS = [
  {
    day: "I",
    date: "14 March",
    title: "Ignition",
    entries: [
      ["09:00", "Doors, check-in, hardware bench opens"],
      ["11:30", "Opening address — the state of building"],
      ["13:00", "Hackathon and CTF clocks start"],
      ["19:00", "Workshop block: shaders, agents, exploitation"],
    ],
  },
  {
    day: "II",
    date: "15 March",
    title: "Momentum",
    entries: [
      ["00:30", "Night track — robotics arena calibration"],
      ["10:00", "Speaker sessions across two stages"],
      ["15:00", "Startup showcase and sponsor expo floor"],
      ["21:00", "Attack–defence finals under lights"],
    ],
  },
  {
    day: "III",
    date: "16 March",
    title: "Daybreak",
    entries: [
      ["07:00", "Submissions freeze"],
      ["10:00", "Judging rounds, arena by arena"],
      ["15:00", "Finalist demos in the main hall"],
      ["18:00", "Awards and closing"],
    ],
  },
];

export default function Timeline() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 90%"],
  });
  const beam = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 30,
    mass: 0.6,
  });

  return (
    <section
      id="timeline"
      ref={ref}
      className="relative border-y border-white/[0.07] bg-carbon/40 py-[18vh]"
    >
      {/* full bleed: no max width, content pushed to the edges */}
      <div className="px-6 md:px-12">
        <div className="mb-[10vh] flex items-end justify-between">
          <Label>003 / Timeline</Label>
          <Label>72 hours</Label>
        </div>

        <div className="relative">
          {/* the beam */}
          <div className="absolute left-0 top-0 h-full w-px bg-white/10 md:left-[8%]" />
          <motion.div
            style={{ scaleY: beam }}
            className="absolute left-0 top-0 h-full w-px origin-top bg-gradient-to-b from-solar via-amber to-transparent md:left-[8%]"
          />

          {DAYS.map((d, di) => (
            <div
              key={d.day}
              className="relative grid grid-cols-12 gap-y-8 pb-[16vh] pl-8 md:pl-0"
            >
              <div className="col-span-12 md:col-span-3 md:col-start-2">
                <div className="sticky top-[26vh]">
                  <motion.h3
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 1.3, ease: EASE }}
                    className="display text-[26vw] leading-[0.78] text-white/[0.09] md:text-[13vw]"
                  >
                    {d.day}
                  </motion.h3>
                  <div className="mt-4 flex flex-col gap-1">
                    <span className="display text-3xl text-white md:text-4xl">
                      {d.title}
                    </span>
                    <Label>{d.date}</Label>
                  </div>
                </div>
              </div>

              <ul
                className={`col-span-12 md:col-span-6 ${
                  di === 1 ? "md:col-start-7" : "md:col-start-6"
                }`}
              >
                {d.entries.map(([time, text], i) => (
                  <motion.li
                    key={time + text}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.8 }}
                    transition={{ duration: 1, ease: EASE, delay: i * 0.05 }}
                    className="group flex gap-8 border-b border-white/[0.07] py-7"
                  >
                    <span className="label w-16 shrink-0 pt-1">{time}</span>
                    <span className="text-lg leading-snug text-white/70 transition-colors duration-500 group-hover:text-white md:text-2xl">
                      {text}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
