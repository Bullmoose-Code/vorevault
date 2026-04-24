import Link from "next/link";
import styles from "./TagChip.module.css";

type Props = {
  name: string;
  href?: string;
  onRemove?: () => void;
};

export function TagChip({ name, href, onRemove }: Props) {
  const label = <span className={styles.label}>#{name}</span>;
  const labelSlot = href ? <Link href={href} className={styles.link}>{label}</Link> : label;
  return (
    <span className={styles.chip}>
      {labelSlot}
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`remove tag ${name}`}
          onClick={onRemove}
        >×</button>
      )}
    </span>
  );
}
