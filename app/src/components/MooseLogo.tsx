import styles from "./MooseLogo.module.css";

type Size = "favicon" | "header" | "hero";
type Variant = "default" | "inverted" | "mono";

const DIMENSIONS: Record<Size, { w: number; h: number; strokeW: number }> = {
  favicon: { w: 22, h: 20, strokeW: 2 },
  header: { w: 40, h: 36, strokeW: 1.8 },
  hero: { w: 72, h: 62, strokeW: 1.5 },
};

export function MooseLogo({
  size = "header",
  variant = "default",
}: {
  size?: Size;
  variant?: Variant;
}) {
  const { w, h, strokeW } = DIMENSIONS[size];
  const className = [styles.moose, variant !== "default" && styles[variant]].filter(Boolean).join(" ");
  return (
    <svg
      className={className}
      width={w}
      height={h}
      viewBox="0 0 44 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M7 8 L3 3 L5 8 L1 6 L4 10 L0 11 L6 12 M7 8 L10 4 L10 9 L13 6 L12 11 L15 10"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M37 8 L41 3 L39 8 L43 6 L40 10 L44 11 L38 12 M37 8 L34 4 L34 9 L31 6 L32 11 L29 10"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M14 14 C14 12, 16 11, 22 11 C28 11, 30 12, 30 14 L30 22 C30 26, 28 30, 26 33 L28 36 L24 35 L22 36 L20 35 L16 36 L18 33 C16 30, 14 26, 14 22 Z" />
      <circle cx="19" cy="18" r="1.2" />
      <circle cx="25" cy="18" r="1.2" />
      <ellipse cx="22" cy="30" rx="2.5" ry="1.2" />
    </svg>
  );
}
