"use client";

import { Fade, Label } from "./Type";

function InstagramIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" />
    </svg>
  );
}

/**
 * Closing beat for the teaser page: signals that the full site is on the
 * way without a generic "coming soon" template. Doubles as a minimal
 * footer — no watermark, no contact grid — just a quiet line and a
 * single social link beneath the statement.
 */
export default function InTheWorks() {
  return (
    <section
      id="in-the-works"
      className="relative flex min-h-[62vh] flex-col justify-center py-[16vh] md:min-h-[70vh]"
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-start gap-7 px-6 md:px-12">
        <Fade index={0}>
          <div className="flex items-center gap-6">
            <Label>002 / Status</Label>
            <div className="rule hidden w-16 md:block" />
          </div>
        </Fade>

        <Fade index={1}>
          <p
            className="display max-w-2xl text-[9vw] text-white sm:text-[6.5vw] md:text-[4.2vw] lg:text-[3.2rem]"
            style={{ lineHeight: 1.15 }}
          >
            Something is taking shape.
          </p>
        </Fade>

        <Fade index={2}>
          <p className="max-w-md text-sm leading-[1.9] text-white/45 sm:text-base">
            The full HELION experience is currently in the works.
          </p>
        </Fade>

        <Fade index={3} className="pt-14 md:pt-20">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="label !text-white/25">
              HELION · Edition 01 · 2027
            </span>
            <a
              href="https://instagram.com/helion.2027"
              target="_blank"
              rel="noopener noreferrer"
              className="label inline-flex items-center gap-2 !text-white/25 transition-colors duration-500 hover:!text-solar"
            >
              <InstagramIcon />
              helion.2027
            </a>
          </div>
        </Fade>
      </div>
    </section>
  );
}
