import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMART@Home · Clinician view",
  description: "One-page asthma dashboard for clinicians (synthetic data)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
