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
