"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VIEWS = [
  { href: "/patient", label: "Patient" },
  { href: "/clinician", label: "Clinician" },
];

export default function ViewSwitch() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: 8 }}>
      {VIEWS.map((v) => {
        const active = pathname.startsWith(v.href);
        return (
          <Link
            key={v.href}
            href={v.href}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #888",
              textDecoration: "none",
              color: active ? "#fff" : "#222",
              background: active ? "#222" : "transparent",
            }}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
