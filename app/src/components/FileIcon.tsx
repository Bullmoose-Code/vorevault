import type { FileKind } from "@/lib/fileKind";
import styles from "./FileIcon.module.css";

type Props = {
  kind: FileKind;
  size?: number;
  className?: string;
};

const LABELS: Record<FileKind, string> = {
  video: "video file",
  audio: "audio file",
  image: "image file",
  document: "document file",
  code: "code file",
  archive: "archive file",
  executable: "executable file",
  "disk-image": "disk-image file",
  font: "font file",
  data: "data file",
  other: "other file",
};

function Path({ kind }: { kind: FileKind }): React.ReactElement {
  switch (kind) {
    case "video":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
        </>
      );
    case "audio":
      return (
        <>
          <path d="M9 18V6l10-2v12" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="16" r="2" />
        </>
      );
    case "image":
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <polyline points="4,18 9,13 14,18 20,12" />
        </>
      );
    case "document":
      return (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <polyline points="14,3 14,8 19,8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="14" y2="17" />
        </>
      );
    case "code":
      return (
        <>
          <polyline points="8,8 3,12 8,16" />
          <polyline points="16,8 21,12 16,16" />
          <line x1="14" y1="5" x2="10" y2="19" />
        </>
      );
    case "archive":
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <line x1="12" y1="4" x2="12" y2="10" strokeDasharray="2 2" />
          <rect x="10" y="12" width="4" height="5" />
        </>
      );
    case "executable":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <polyline points="7,10 10,12 7,14" />
          <line x1="13" y1="14" x2="17" y2="14" />
        </>
      );
    case "disk-image":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="3" x2="12" y2="9" />
        </>
      );
    case "font":
      return (
        <>
          <polyline points="6,19 10,5 14,19" />
          <line x1="7.5" y1="13" x2="12.5" y2="13" />
          <line x1="14" y1="8" x2="20" y2="8" />
          <line x1="17" y1="8" x2="17" y2="19" />
        </>
      );
    case "data":
      return (
        <>
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
          <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
        </>
      );
    case "other":
    default:
      return (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <polyline points="14,3 14,8 19,8" />
        </>
      );
  }
}

export function FileIcon({ kind, size = 24, className }: Props): React.ReactElement {
  const label = LABELS[kind];
  const classes = className ? `${styles.icon} ${className}` : styles.icon;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={classes}
    >
      <Path kind={kind} />
    </svg>
  );
}
