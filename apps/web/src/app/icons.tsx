/** Minimal stroke-line icons (Lucide-style): 24 viewBox, currentColor, round caps. */

function Svg({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconFileUp({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M15 3v4h4" />
      <path d="M12 17v-5" />
      <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
    </Svg>
  );
}

export function IconSearch({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function IconGlobe({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z" />
    </Svg>
  );
}

export function IconTrendDown({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="m3 7 6.5 6.5 4-4L21 17" />
      <path d="M21 11v6h-6" />
    </Svg>
  );
}

export function IconChart({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </Svg>
  );
}

export function IconLanguages({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 5h9" />
      <path d="M8.5 3v2" />
      <path d="M11.5 5a12 12 0 0 1-6.5 8.5" />
      <path d="M5.5 8a11 11 0 0 0 6 5.5" />
      <path d="m13.5 20 4-9.5 4 9.5" />
      <path d="M14.8 17h5.4" />
    </Svg>
  );
}

export function IconUpload({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 15V4" />
      <path d="m7 8.5 5-4.5 5 4.5" />
      <path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
    </Svg>
  );
}

/** Filled four-point spark — the brand mark. */
export function IconSpark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c.7 4.5 2.8 7.3 7.6 8.4.5.1.5 1 0 1.2C14.8 12.7 12.7 15.5 12 20c-.7-4.5-2.8-7.3-7.6-8.4-.5-.1-.5-1 0-1.2C9.2 9.3 11.3 6.5 12 2Z" />
    </svg>
  );
}
