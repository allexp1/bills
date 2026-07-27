import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

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
   still serve the landing page. */
const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

export default clerkConfigured
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
