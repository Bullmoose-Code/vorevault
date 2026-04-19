import { MooseLogo } from "@/components/MooseLogo";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <MooseLogo size="hero" />
        <h1 className={`vv-brand ${styles.brand}`}>vorevault</h1>
        <p className={styles.tagline}>
          the <strong>bullmoose</strong> clip archive
        </p>
        <a className={styles.discordBtn} href="/api/auth/discord">
          <svg width="18" height="14" viewBox="0 0 71 55" fill="#fff" aria-hidden="true">
            <path d="M60.1 4.9A58.6 58.6 0 0 0 45.6.1a37.7 37.7 0 0 0-2 4.1c-5.1-.8-10.2-.8-15.3 0-.6-1.4-1.3-2.8-2-4.1a58.4 58.4 0 0 0-14.5 4.8C2.8 23.7-.7 41.5.9 59c6.1 4.5 12 7.2 17.9 9 1.4-1.9 2.7-4 3.8-6.1-2.1-.8-4.2-1.8-6.1-3 .5-.4 1-.8 1.5-1.2 11.7 5.4 24.4 5.4 35.9 0 .5.4 1 .8 1.5 1.2-1.9 1.2-4 2.2-6.1 3 1.1 2.1 2.4 4.2 3.8 6.1 5.9-1.8 11.8-4.5 17.9-9 1.8-20.3-3.1-38-14.9-54.1zM24 45.9c-3.5 0-6.4-3.2-6.4-7.2 0-3.9 2.8-7.2 6.4-7.2s6.4 3.2 6.4 7.2c0 4-2.9 7.2-6.4 7.2zm23 0c-3.5 0-6.4-3.2-6.4-7.2 0-3.9 2.8-7.2 6.4-7.2s6.4 3.2 6.4 7.2c.1 4-2.8 7.2-6.4 7.2z" />
          </svg>
          Sign in with Discord
        </a>
        <div className={styles.footnote}>
          You need the <strong>vorevault</strong> role in the Bullmoose server.
        </div>
      </div>
    </main>
  );
}
