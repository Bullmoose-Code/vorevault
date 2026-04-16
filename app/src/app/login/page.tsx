export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", textAlign: "center" }}>
      <h1>VoreVault</h1>
      <p>Discord-gated clip vault for the Bullmoose group.</p>
      <a
        href="/api/auth/discord"
        style={{
          display: "inline-block",
          marginTop: "1.5rem",
          padding: "0.75rem 1.5rem",
          background: "#5865F2",
          color: "white",
          textDecoration: "none",
          borderRadius: "0.5rem",
          fontWeight: 600,
        }}
      >
        Sign in with Discord
      </a>
    </main>
  );
}
