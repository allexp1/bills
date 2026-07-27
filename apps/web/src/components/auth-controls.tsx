import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { clerkEnabled } from "../lib/clerk-enabled.js";
import { NeuButton } from "./ui/neu.js";

/**
 * Sign in, sign up and the account button, in the header.
 *
 * Renders nothing at all when Clerk is unconfigured. Showing a sign-in button
 * that cannot work is worse than showing none: the person clicks it, lands
 * somewhere broken, and concludes the product is broken rather than unfinished.
 */
export function AuthControls() {
  if (!clerkEnabled) return null;

  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="rounded-pill bg-card px-4 py-2 text-sm font-medium text-muted neu-raised-sm neu-press hover:text-ink">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="hidden rounded-pill bg-card px-4 py-2 text-sm font-medium text-muted neu-raised-sm neu-press hover:text-ink sm:inline-flex">
            Create account
          </button>
        </SignUpButton>
      </Show>

      <Show when="signed-in">
        <NeuButton href="/portfolio" tone="quiet" size="sm">
          My bills
        </NeuButton>
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
    </>
  );
}
