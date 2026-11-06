"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Patient view is temporarily switched off; set disabled: false to bring the tab back.
const VIEWS = [
  { href: "/patient", label: "Patient", disabled: true },
  { href: "/clinician", label: "Clinician", disabled: false },
];

const tab = { padding: "6px 14px", borderRadius: 6, border: "1px solid #888", textDecoration: "none" };

export default function ViewSwitch() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: 8 }}>
      {VIEWS.map((v) => {
        if (v.disabled)
          return (
            <span key={v.href} aria-disabled="true" title="Temporarily unavailable" style={{ ...tab, color: "#999", borderColor: "#ccc", cursor: "not-allowed" }}>
              {v.label}
            </span>
          );
        const active = pathname.startsWith(v.href);
        return (
          <Link
            key={v.href}
            href={v.href}
            aria-current={active ? "page" : undefined}
            style={{ ...tab, color: active ? "#fff" : "#222", background: active ? "#222" : "transparent" }}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
