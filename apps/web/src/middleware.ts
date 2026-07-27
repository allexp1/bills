import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { clerkEnabled } from "./lib/clerk-enabled.js";

/**
 * Only the account area is behind Clerk.
 *
 * The webhooks, the cron endpoints and the share links must stay open: bills
 * arrive from WhatsApp and Telegram before anyone has ever seen the website,
 * and /s/[token] is the link a customer receives in a chat thread. Putting
 * auth in front of those would break the product's main path in order to
 * protect a page that does not exist yet.
 */
const isProtected = createRouteMatcher(["/portfolio(.*)", "/account(.*)"]);

/* When Clerk is not configured, protected routes redirect home rather than
   crashing the whole site. Preview builds and local runs without keys should
   still serve the landing page.
 *
 * This gate reads the SAME single variable the rest of the app reads, and it
 * has to. The first version also required CLERK_SECRET_KEY, which broke
 * production: Next.js inlines non-public variables into the edge bundle at
 * build time, so the secret did not resolve here even though it was set in
 * Vercel. The app saw the public key and switched Clerk on, the middleware saw
 * a missing secret and quietly installed the no-op instead, and every auth()
 * call then failed with "Clerk can't detect usage of clerkMiddleware()".
 *
 * Two gates that can disagree are worse than one gate that is occasionally
 * wrong, because the disagreement only surfaces in the environment where their
 * inputs differ. One source of truth, shared with lib/clerk-enabled. */
export default clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) await auth.protect();
    })
  : function middleware(req: NextRequest) {
      if (isProtected(req)) {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        url.searchParams.set("auth", "unconfigured");
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Everything except static assets, plus every API route.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path, which must be matched for its handshake to work.
    "/__clerk/:path*",
  ],
};
