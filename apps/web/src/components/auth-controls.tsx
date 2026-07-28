import { Show, UserButton } from "@clerk/nextjs";
import { clerkEnabled } from "../lib/clerk-enabled.js";

/**
 * Sign in and account controls in the header.
 *
 * The sign-in link is a plain anchor, rendered unconditionally whenever Clerk
 * is configured. It used to sit inside <Show when="signed-out">, and on
 * production that branch rendered nothing at all, so the site had working
 * authentication with no visible way to reach it. Whatever the cause, the entry
 * point into an auth system is the wrong place to depend on that auth system
 * having resolved: it fails closed, and a link that never appears is
 * indistinguishable from a feature that was never built.
 *
 * So the link is ordinary HTML that works without JavaScript and without a
 * session lookup. Clerk state is used only to add things for people who are
 * already signed in, which is the direction where failing quiet is harmless.
 */
export function AuthControls() {
  if (!clerkEnabled) return null;

  return (
    <>
      <Show when="signed-in">
        <a
          href="/portfolio"
          className="rounded-pill bg-card px-4 py-2 text-sm font-medium text-muted neu-raised-sm neu-press hover:text-ink"
        >
          My bills
        </a>
        <span className="inline-flex items-center">
          <UserButton
            appearance={{
              elements: {
                avatarBox: {
                  width: "34px",
                  height: "34px",
                  boxShadow:
                    "4px 4px 10px rgba(0,0,0,0.38), -4px -4px 10px rgba(255,255,255,0.045)",
                },
              },
            }}
          />
        </span>
      </Show>

      <a
        href="/sign-in"
        data-fx-signin
        className="rounded-pill bg-card px-4 py-2 text-sm font-medium text-muted neu-raised-sm neu-press hover:text-ink"
      >
        Sign in
      </a>
    </>
  );
}
