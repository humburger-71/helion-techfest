"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useScroll,
  useTransform,
} from "framer-motion";
import { EASE } from "@/lib/motion";
import { Label } from "./Type";

type Arena = {
  id: string;
  index: string;
  title: string;
  kind: string;
  copy: string;
  /** abstract composition — light, geometry, depth. No literal imagery. */
  art: string;
};

const ARENAS: Arena[] = [
  {
    id: "hackathon",
    index: "01",
    title: "The Build",
    kind: "Hackathon · 36h",
    copy: "One floor, one clock, one prototype that has to survive a demo.",
    art: "radial-gradient(90% 70% at 25% 25%, rgba(255,140,40,0.85), transparent 60%), conic-gradient(from 210deg at 72% 72%, rgba(233,196,106,0.5), transparent 45%), linear-gradient(160deg,#1a1310,#08090c)",
  },
  {
    id: "ctf",
    index: "02",
    title: "The Breach",
    kind: "Capture The Flag",
    copy: "Adversarial thinking as a sport. Jeopardy rounds into live attack-defence.",
    art: "linear-gradient(115deg,#08090c 12%,rgba(255,122,24,0.6) 52%,#0a0b0e 82%), repeating-linear-gradient(75deg, rgba(255,255,255,0.09) 0 1px, transparent 1px 22px)",
  },
  {
    id: "games",
    index: "03",
    title: "The Play",
    kind: "Game Development",
    copy: "Systems, feel and feedback loops — shipped as something worth replaying.",
    art: "radial-gradient(70% 100% at 82% 12%, rgba(255,179,71,0.8), transparent 62%), radial-gradient(70% 70% at 18% 88%, rgba(255,110,20,0.5), transparent 68%), #08090c",
  },
  {
    id: "robotics",
    index: "04",
    title: "The Machine",
    kind: "Robotics",
    copy: "Hardware that has to work in the room, not in the slide deck.",
    art: "conic-gradient(from 40deg at 50% 50%, #0b0c10, rgba(255,140,35,0.75), #0b0c10 72%), repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08) 0 1px, transparent 1px 26px)",
  },
  {
    id: "ai",
    index: "05",
    title: "The Signal",
    kind: "Artificial Intelligence",
    copy: "Models, agents and evaluation — judged on what they actually do.",
    art: "linear-gradient(200deg,#08090c,#1b1209 58%), radial-gradient(110% 80% at 50% 112%, rgba(255,150,50,0.95), transparent 62%)",
  },
];

export default function Arenas() {
  const [active, setActive] = useState(0);
  const arena = ARENAS[active];
  const section = useRef<HTMLElement>(null);

  // the composition is unveiled by the scroll itself, bottom edge upward
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start end", "start 35%"],
  });
  const inset = useTransform(scrollYProgress, [0, 1], [100, 0]);
  const clipPath = useMotionTemplate`inset(${inset}% 0% 0% 0%)`;

  return (
    <section
      id="arenas"
      ref={section}
      className="relative pt-[12vh] pb-[26vh]"
      onMouseLeave={() => setActive(0)}
    >
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-12 gap-y-14 px-6 md:px-12">
        {/* metadata sits right — the composition is mirrored against Manifesto */}
        <div className="col-span-12 flex items-center justify-end gap-6 md:col-span-12">
          <div className="rule hidden flex-1 rotate-180 md:block" />
          <Label>002 / Arenas</Label>
        </div>

        {/* Sticky abstract composition, bleeding off the left edge */}
        <div className="col-span-12 md:col-span-5">
          <div className="sticky top-[18vh]">
            <motion.div
              style={{ clipPath }}
              className="relative -ml-6 h-[52vh] overflow-hidden md:-ml-12 md:h-[68vh]"
            >
              <AnimatePresence mode="sync">
                <motion.div
                  key={arena.id}
                  initial={{ opacity: 0, scale: 1.06 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, ease: EASE }}
                  className="absolute inset-0"
                  style={{ backgroundImage: arena.art }}
                />
              </AnimatePresence>
              <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,7,9,0.85),transparent_55%)]" />
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                <span className="label">{arena.kind}</span>
                <span className="display text-4xl text-white/25">
                  {arena.index}
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* The index of arenas, inset from the right */}
        <div className="col-span-12 md:col-span-6 md:col-start-7">
          <ul className="mt-2 border-t border-white/10">
            {ARENAS.map((a, i) => (
              <li key={a.id}>
                <motion.button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 1, ease: EASE, delay: i * 0.06 }}
                  className="group block w-full border-b border-white/10 py-8 text-left md:py-10"
                >
                  <div className="flex items-baseline gap-6">
                    <span className="label w-8 shrink-0">{a.index}</span>
                    <motion.h3
                      animate={{
                        opacity: active === i ? 1 : 0.4,
                        x: active === i ? 12 : 0,
                      }}
                      transition={{ duration: 0.8, ease: EASE }}
                      className="display text-[10vw] md:text-[4.4vw] lg:text-[4rem]"
                    >
                      {a.title}
                    </motion.h3>
                  </div>
                  <motion.p
                    animate={{
                      opacity: active === i ? 1 : 0,
                      height: active === i ? "auto" : 0,
                    }}
                    transition={{ duration: 0.8, ease: EASE }}
                    className="overflow-hidden pl-14 text-sm leading-relaxed text-white/45"
                  >
                    <span className="block pt-4 max-w-sm">{a.copy}</span>
                  </motion.p>
                </motion.button>
              </li>
            ))}
          </ul>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 1.2, ease: EASE }}
            className="mt-10 max-w-sm text-sm leading-[1.9] text-white/35"
          >
            Alongside the arenas: workshops, speaker sessions, a startup
            showcase and a sponsor expo running continuously across all three
            days.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
