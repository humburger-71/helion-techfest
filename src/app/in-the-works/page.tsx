import type { Metadata } from "next";
import Hero from "@/components/Hero";
import Details from "@/components/Details";
import InTheWorks from "@/components/InTheWorks";

/**
 * Public "in the works" teaser — a separate, stripped-down duplicate of
 * the homepage for pre-launch. Reuses the production Hero (with its
 * particle background, motion and branding intact) plus two minimal
 * editorial beats. The full site lives untouched at "/full".
 * The brand mark lives inside <Hero variant="teaser"> itself, so it
 * scrolls away with the hero rather than staying fixed on screen.
 */
export const metadata: Metadata = {
  title: "HELION",
  description:
    "HELION is a student-led technology festival. The full experience is currently in the works.",
};

export default function InTheWorksPage() {
  return (
    <main>
      <Hero variant="teaser" tagline="Build Beyond the Horizon." />
      <Details />
      <InTheWorks />
    </main>
  );
}
