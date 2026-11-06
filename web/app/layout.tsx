import ViewSwitch from "./ViewSwitch";

export const metadata = { title: "Eureka Digital Health" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 24px", borderBottom: "1px solid #ddd" }}>
          <strong>Eureka</strong>
          <ViewSwitch />
        </header>
        <main style={{ padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
