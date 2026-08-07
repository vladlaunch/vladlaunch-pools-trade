/**
 * Two marks, drawn as paths so they inherit currentColor and never depend on a font
 * or an icon package. Link rows read as icons, not as prose: a row of "@handle ·
 * example.com · 0xabc…" makes three unlike things look alike.
 */

/** The current X mark, not the retired bird. */
export function XMark({ size = 13, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1200 1227"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" />
    </svg>
  );
}

/** Globe for a project's own site. */
export function GlobeMark({ size = 13, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.25" />
      <path d="M2.9 12h18.2" />
      <path d="M12 2.75c2.4 2.6 3.6 5.75 3.6 9.25s-1.2 6.65-3.6 9.25c-2.4-2.6-3.6-5.75-3.6-9.25s1.2-6.65 3.6-9.25Z" />
    </svg>
  );
}
