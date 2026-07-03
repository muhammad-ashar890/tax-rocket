"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TaxRocketLogo } from "@/components/tax/taxrocket-logo";

const links = [
  { href: "/tax/dashboard", label: "Dashboard" },
  { href: "/tax/new", label: "New Filing" },
  { href: "/tax/documents", label: "Documents" },
  { href: "/tax/fbr-connect", label: "FBR Connect" },
  { href: "/tax/profile", label: "Profile" },
  { href: "/tax/settings", label: "Settings" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/tax/dashboard" className="flex items-center gap-2">
          <TaxRocketLogo />
          {/* <span className="rounded-full border border-[#376952]/30 bg-[#376952]/10 px-2 py-0.5 text-[10px] font-medium text-[#376952]">
            Redesign Demo
          </span> */}
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800",
                pathname?.startsWith(link.href) &&
                  "bg-[#376952]/10 text-[#376952]",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
