import styles from "./Pill.module.css";

type Variant = "primary" | "ghost";

type PillProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
};

export function Pill({ variant = "primary", className, children, ...rest }: PillProps) {
  const cls = [styles.pill, styles[variant], className].filter(Boolean).join(" ");
  return (
    <a className={cls} {...rest}>
      {children}
    </a>
  );
}
