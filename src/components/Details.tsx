"use client";

import { Fade, Label } from "./Type";

/**
 * The single-line "what this is" beat for the teaser page. Deliberately
 * bare — one label, one statement, nothing competing for attention.
 */
export default function Details() {
  return (
    <section id="details" className="relative py-[16vh] md:py-[20vh]">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-start gap-7 px-6 md:px-12">
        <Fade index={0}>
          <div className="flex items-center gap-6">
            <Label>001 / About</Label>
            <div className="rule hidden w-16 md:block" />
          </div>
        </Fade>

        <Fade index={1}>
          <p
            className="display max-w-2xl text-[9vw] text-white sm:text-[6.5vw] md:text-[4.2vw] lg:text-[3.2rem]"
            style={{ lineHeight: 1.15 }}
          >
            What is HELION?
          </p>
        </Fade>

        <Fade index={2}>
          <p className="max-w-md text-sm leading-[1.9] text-white/45 sm:text-base">
            HELION is an upcoming student-hosted technology festival at
            Bangalore in 2027, for students.
          </p>
        </Fade>
      </div>
    </section>
  );
}
