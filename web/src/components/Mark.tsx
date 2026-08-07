/* The supplied artwork, used as-is. Kept behind a component so the nav, any future
   share card, and the favicon all point at one file. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size mark, no optimisation to gain
    <img
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-[6px] object-cover ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
