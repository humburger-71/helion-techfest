/** The standalone H mark. */
export function LogoMark({ className = "h-8 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/helion-icon.png" alt="Helion" className={className} />;
}

/** Icon + wordmark lockup, set in the display typeface so it always
 *  matches the current heading font rather than baking text into a raster. */
export function LogoLockup({
  className = "",
  markClassName = "h-7 w-auto",
  textClassName = "text-lg",
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span
        className={`font-display font-semibold tracking-[0.28em] text-white ${textClassName}`}
      >
        HELION
      </span>
    </span>
  );
}
