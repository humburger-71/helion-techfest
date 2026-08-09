import type { Metadata } from "next";
import Hero from "@/components/Hero";
import Details from "@/components/Details";
import InTheWorks from "@/components/InTheWorks";

/**
 * Public entry point during pre-launch: the "in the works" teaser.
 * The full production homepage is preserved, untouched, at /full —
 * this file just swaps which experience greets visitors at "/".
 * The brand mark lives inside <Hero variant="teaser"> itself, so it
 * scrolls away with the hero rather than staying fixed on screen.
 */
export const metadata: Metadata = {
  title: "HELION",
  description:
    "HELION is a student-led technology festival. The full experience is currently in the works.",
};

export default function RootPage() {
  return (
    <main>
      <Hero variant="teaser" tagline="Build Beyond the Horizon." />
      <Details />
      <InTheWorks />
    </main>
  );
}
