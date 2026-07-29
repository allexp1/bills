import { AuthControls } from "./auth-controls.js";
import { Logo } from "./logo.js";
import { ThemeToggle } from "./theme-toggle.js";
import { NeuButton } from "./ui/neu.js";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#the-gap", label: "What loyalty costs" },
  { href: "#privacy", label: "Privacy" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 bg-base/85 backdrop-blur-md">
      {/* gap-3 on phones, gap-6 from sm up. At 390px the old flat gap-6 plus
          four controls overflowed the row, and flex resolved it by wrapping the
          labels: "Sign / in" on two lines and "Upload a / bill" on two more. */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:gap-6">
        <a href="/" aria-label="Fixplo.ai home">
          <Logo />
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="rounded-pill px-4 py-2 text-sm font-medium text-muted neu-press hover:text-ink"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <ThemeToggle />
          <AuthControls />
          {/* Hidden on phones on purpose. The hero has a full-width "Upload a
              bill" a thumb-length below it, so the header copy was the second
              of two identical calls to action and the one causing the overflow.
              From sm up there is room and it earns its place, because the hero
              button has scrolled away by then.

              The hiding lives on a wrapper rather than on the button, and it
              has to. NeuButton hardcodes inline-flex in its own class list, and
              Tailwind emits .inline-flex after .hidden, so passing "hidden" in
              className loses on source order no matter which order the classes
              are written in. A wrapper has no display utility to fight. */}
          <span className="hidden sm:inline-flex">
            <NeuButton href="/upload" size="sm" className="whitespace-nowrap">
              Upload a bill
            </NeuButton>
          </span>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-5 pb-14 pt-6">
      <div className="rounded-card bg-card p-8 neu-raised">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Fixplo reads your utility bills, tells you what you are actually paying for, and
              negotiates a better rate on your behalf.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            <a href="/upload" className="text-muted hover:text-ink">
              Upload a bill
            </a>
            <a href="#privacy" className="text-muted hover:text-ink">
              Privacy
            </a>
            <a href="#how-it-works" className="text-muted hover:text-ink">
              How it works
            </a>
            <a href="mailto:hello@fixplo.ai" className="text-muted hover:text-ink">
              Contact
            </a>
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-dim">
          Fixplo is not a law firm and does not give legal or financial advice. Negotiation outcomes
          depend on your provider, your contract and your usage, so results vary. Published research
          cited on this page describes the UK market and is not a forecast of your result.
        </p>
      </div>
    </footer>
  );
}
