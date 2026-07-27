/* Fixplo logomark: a geometric F whose lower arm resolves into a downward
   arrow, for a price coming down. Purple to green gradient, matching the
   brand board. */
export function Logomark({ size = 32 }: { size?: number }) {
  const gradientId = `fx-mark-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="3" x2="27" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C5CFC" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M11 8.5h11.5v3.6H14.6v3.5h6.2v3.5h-6.2v4.4h-3.6V8.5Z"
        fill="#fff"
        fillOpacity="0.96"
      />
      <path
        d="M21.4 17.9v4.9l2-1.6 1.4 1.7-4.2 3.4-4.2-3.4 1.4-1.7 2 1.6v-4.9h1.6Z"
        fill="#fff"
        fillOpacity="0.96"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-extrabold tracking-tight text-ink">Fixplo</span>
      <span className="font-extrabold tracking-tight text-brand">.ai</span>
    </span>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logomark size={size} />
      <Wordmark className="text-lg" />
    </span>
  );
}
