import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { themeInitScript } from "../components/theme-toggle.js";
import { clerkAppearance, clerkEnabled } from "../lib/clerk-enabled.js";
/* tailwind.css imports globals.css into a cascade layer. See the note there. */
import "./tailwind.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fixplo.ai"),
  title: "Fixplo.ai",
  description:
    "Fixplo reads your utility bills, explains every charge, then calls your provider and negotiates a better rate on your behalf.",
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8e4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1b2e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const shell = (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* ClerkProvider belongs inside body, not wrapping html. */}
      <body>
        {clerkEnabled ? (
          <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );

  return shell;
}
