export const metadata = {
  title: "VoreVault",
  description: "Bullmoose clip vault",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
