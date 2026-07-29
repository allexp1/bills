/**
 * Whether Clerk is fully configured for this build.
 *
 * BOTH keys are required, and that is the whole point. Gating on the
 * publishable key alone took the site down: the key was present, so
 * ClerkProvider rendered and called auth(), the secret was absent, so Clerk
 * could not initialise, and every route returned 500. Half-configured auth is
 * not a degraded state, it is a broken one, so it has to read as "off".
 *
 * Only imported by server components and middleware, never by a client
 * component. CLERK_SECRET_KEY does not exist in a browser bundle, so a client
 * import would evaluate this false in the browser and true on the server, and
 * hydration would tear.
 */
export const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

/**
 * Whether a Clerk publishable key exists. Deliberately separate from
 * clerkEnabled above.
 *
 * NEXT_PUBLIC_ values are inlined at build, so this resolves identically in
 * every bundle: edge, node and browser. CLERK_SECRET_KEY does not. It is
 * inlined into the edge bundle at build but read live in the node runtime, and
 * on this deployment those two disagreed: middleware saw a secret, the server
 * render did not, so the header rendered no sign-in control while Clerk was
 * demonstrably running.
 *
 * Rather than diagnose that a third time, the navigation link now depends only
 * on the value that cannot disagree with itself. Anything that would crash
 * without a provider still uses clerkEnabled.
 */
export const clerkLinkVisible = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Clerk's components are styled to sit inside the neumorphic surfaces rather
 * than on top of them: no hard borders, shadows for depth, brand purple for
 * anything actionable.
 *
 * Two things had gone wrong here and they compounded.
 *
 * First, the variable names were the pre-v7 set. `colorText`,
 * `colorTextSecondary`, `colorInputBackground` and `colorInputText` no longer
 * exist; v7 calls them `colorForeground`, `colorMutedForeground`, `colorInput`
 * and `colorInputForeground`. Unknown keys are dropped silently, so the dark
 * background applied and the text colour did not: the account dialog rendered
 * Clerk's default near-black type on our near-black card, which is the
 * "unreadable account window" that got reported.
 *
 * Second, every value was a hard-coded dark hex, so in light mode a dark panel
 * appeared over a light page. The colours below are var() references to the
 * same tokens the rest of the app uses, which now live on :root precisely so
 * they resolve inside Clerk's portal. The dialog follows the theme toggle for
 * free, with no second source of truth to keep in sync.
 *
 * The exceptions are the scale colours. Clerk derives a full ramp from
 * colorPrimary, colorDanger and colorSuccess, which needs a real parseable
 * colour rather than a variable reference, so those stay literal. They are
 * identical in both themes anyway.
 */
export const clerkAppearance = {
  variables: {
    /* Parsed by Clerk to build a scale, so these cannot be var(). */
    colorPrimary: "#7c5cfc",
    colorDanger: "#ef4444",
    colorSuccess: "#10b981",
    colorWarning: "#f59e0b",

    colorBackground: "var(--fx-bg-card)",
    colorForeground: "var(--fx-text-primary)",
    colorMuted: "var(--fx-bg-card-hover)",
    colorMutedForeground: "var(--fx-text-muted)",
    colorInput: "var(--fx-bg-card)",
    colorInputForeground: "var(--fx-text-primary)",
    colorPrimaryForeground: "#ffffff",
    colorBorder: "var(--fx-border)",
    colorRing: "#7c5cfc",
    colorShadow: "var(--fx-border)",
    colorModalBackdrop: "var(--fx-backdrop)",

    borderRadius: "12px",
    fontFamily: "var(--font-geist-sans)",
    fontFamilyMono: "var(--font-geist-mono)",
  },
  elements: {
    /* Depth from dual shadows, never a border. Same rule as the rest of the
       design system, and the reason every border is explicitly removed. */
    card: {
      backgroundColor: "var(--fx-bg-card)",
      boxShadow: "var(--fx-raised)",
      border: "none",
    },
    modalContent: {
      boxShadow: "var(--fx-raised-lg)",
    },
    formFieldInput: {
      backgroundColor: "var(--fx-bg-card)",
      boxShadow: "var(--fx-inset)",
      border: "none",
    },
    formButtonPrimary: {
      boxShadow: "var(--fx-raised-sm)",
      textTransform: "none" as const,
      fontWeight: 600,
    },
    avatarBox: {
      boxShadow: "var(--fx-raised-sm)",
    },
  },
};
