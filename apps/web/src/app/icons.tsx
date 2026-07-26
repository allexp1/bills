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

export function IconMegaphone({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l1.5 4.5a1 1 0 0 0 1.9-.6L9 15" />
      <path d="M7 15V9l11-4.5v15L7 15Z" />
      <path d="M21 10.5v3" />
    </Svg>
  );
}

export function IconPhoneCall({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M5 4h3l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4Z" />
    </Svg>
  );
}

export function IconAlertCircle({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.2v.3" />
    </Svg>
  );
}

export function IconReceipt({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M5 3.5v17l2.3-1.5 2.3 1.5 2.4-1.5 2.3 1.5 2.4-1.5 2.3 1.5v-17H5Z" />
      <path d="M9 8.5h6" />
      <path d="M9 12.5h6" />
    </Svg>
  );
}

export function IconListCheck({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 6.5h10" />
      <path d="M4 12h10" />
      <path d="M4 17.5h6" />
      <path d="m16 16.5 2 2 4-4" />
    </Svg>
  );
}
