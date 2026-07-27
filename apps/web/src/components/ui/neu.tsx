import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export { cx };

type Elevation = "raised" | "inset" | "flat";

const elevationClass: Record<Elevation, string> = {
  raised: "neu-raised",
  inset: "neu-inset",
  flat: "neu-flat",
};

export function NeuCard({
  children,
  className,
  elevation = "raised",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  elevation?: Elevation;
  as?: "div" | "section" | "article" | "li" | "aside";
}) {
  return (
    <Tag
      className={cx(
        "rounded-card bg-card p-6",
        elevationClass[elevation],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

type ButtonTone = "brand" | "savings" | "quiet" | "danger";

const toneClass: Record<ButtonTone, string> = {
  brand: "bg-brand text-white hover:bg-brand-deep",
  savings: "bg-savings text-[#04231a] hover:brightness-105",
  quiet: "bg-card text-ink neu-raised-sm hover:bg-card-hover",
  danger: "bg-alert text-white hover:brightness-110",
};

export function NeuButton({
  children,
  href,
  onClick,
  tone = "brand",
  size = "md",
  className,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: ButtonTone;
  size?: "sm" | "md" | "lg";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const sizing =
    size === "lg"
      ? "px-8 py-4 text-base"
      : size === "sm"
        ? "px-4 py-2 text-sm"
        : "px-6 py-3 text-sm";

  const classes = cx(
    "inline-flex items-center justify-center gap-2 rounded-pill font-semibold neu-press",
    "disabled:cursor-not-allowed disabled:opacity-50",
    tone !== "quiet" && "neu-raised-sm",
    sizing,
    toneClass[tone],
    className,
  );

  if (href) {
    return (
      <a className={classes} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

type BadgeTone = "brand" | "savings" | "alert" | "warning" | "neutral";

const badgeTone: Record<BadgeTone, string> = {
  brand: "text-brand-soft",
  savings: "text-savings",
  alert: "text-alert",
  warning: "text-warning",
  neutral: "text-muted",
};

export function NeuBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-pill bg-card px-3 py-1.5 text-xs font-semibold tracking-wide neu-raised-sm",
        badgeTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-soft">
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  className,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto max-w-2xl text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h2>
      {lede ? <p className="mt-4 text-base leading-relaxed text-muted">{lede}</p> : null}
    </div>
  );
}

export function Money({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("font-mono tabular-nums", className)}>{children}</span>
  );
}
