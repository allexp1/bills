/**
 * Whether Clerk is configured for this build.
 *
 * NEXT_PUBLIC_ variables are inlined at build time, so this resolves the same
 * on the server and in the browser. Everything Clerk-related is gated on it so
 * that a build without keys, which is every preview until the keys are set,
 * still serves the site instead of crashing on a missing provider.
 */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Clerk's components are styled to sit inside the neumorphic surfaces rather
 * than on top of them: no hard borders, shadows for depth, brand purple for
 * anything actionable.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#7c5cfc",
    colorBackground: "#262340",
    colorText: "#e8e4f0",
    colorTextSecondary: "#8a86a0",
    colorInputBackground: "#262340",
    colorInputText: "#e8e4f0",
    colorDanger: "#ef4444",
    colorSuccess: "#10b981",
    borderRadius: "12px",
    fontFamily: "var(--font-geist-sans)",
  },
  elements: {
    card: {
      backgroundColor: "#262340",
      boxShadow: "8px 8px 16px rgba(0,0,0,0.4), -8px -8px 16px rgba(255,255,255,0.05)",
      border: "none",
    },
    formFieldInput: {
      backgroundColor: "#262340",
      boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.4), inset -4px -4px 8px rgba(255,255,255,0.05)",
      border: "none",
    },
    formButtonPrimary: {
      boxShadow: "4px 4px 10px rgba(0,0,0,0.38), -4px -4px 10px rgba(255,255,255,0.045)",
      textTransform: "none" as const,
      fontWeight: 600,
    },
  },
};
