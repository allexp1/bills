import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { clerkEnabled } from "./lib/clerk-enabled.js";

/**
 * Middleware attaches the Clerk session and nothing else.
 *
 * Nothing is force-protected here. auth.protect() rewrites to a 404 for a
 * signed-out visitor on a normal page, which is exactly what /portfolio was
 * doing: the page has a perfectly good signed-out view with a sign-in button,
 * and nobody could ever reach it. A 404 also tells the person the page does not
 * exist, which is a worse and less true thing than telling them to sign in.
 *
 * So protection lives where the content is. Each page reads the session and
 * renders its own signed-out state.
 *
 * The webhooks, the cron endpoints and the share links must stay open in any
 * case: bills arrive from WhatsApp and Telegram long before anyone has seen the
 * website, and /s/[token] is the link a customer receives in a chat thread.
 *
 * The gate below reads the same clerkEnabled constant as the rest of the app.
 * An earlier version had its own copy requiring both keys, disagreed with the
 * app in production, and every route returned 500.
 */
export default clerkEnabled
  ? clerkMiddleware()
  : function middleware(_req: NextRequest) {
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
