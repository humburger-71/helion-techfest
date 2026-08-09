import { Label } from "./Type";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.07] px-6 py-12 md:px-12">
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-12 items-end gap-y-8">
        <div className="col-span-12 md:col-span-6">
          <span className="display text-[16vw] leading-none text-white/[0.06] md:text-[9vw]">
            HELION
          </span>
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label>Contact</Label>
          <div className="mt-4 flex flex-col gap-2 text-sm text-white/45">
            <a href="mailto:hello@helion.fest" className="hover:text-white">
              hello@helion.fest
            </a>
            <a href="mailto:partners@helion.fest" className="hover:text-white">
              partners@helion.fest
            </a>
          </div>
        </div>
        <div className="col-span-6 md:col-span-3 md:text-right">
          <Label>Edition 01 · 2026</Label>
          <p className="mt-4 text-sm text-white/30">
            Student-led. Independently organised.
          </p>
        </div>
      </div>
    </footer>
  );
}
