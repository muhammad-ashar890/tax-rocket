"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  Settings,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaxRocketLogo } from "@/components/tax/taxrocket-logo";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import {
  AUTH_EVENT,
  DEMO_USER,
  getInitials,
  isLoggedIn,
  logout,
} from "@/lib/demo-auth";

/**
 * SiteHeader — v5.
 *
 * v5 (this pass, updated): hamburger button — theme-colored, visible
 * only on mobile/tablet via `lg:hidden` — opens a left-side slide-in
 * drawer (MobileNavDrawer). The drawer is menu-only (Home / New Filing
 * / Bank Intelligence / FBR Connect / Profile / Settings, mirroring
 * DashboardSidebar exactly) — no Login/Sign Up/Log out inside it, since
 * those already live in the header's own profile dropdown / auth
 * buttons and having them twice caused visual bleed-through bugs.
 *
 * v4 (still in effect): Help icon always visible, logged-in or not.
 * v3 (still in effect): profile dropdown hover/focus states — Profile
 * /Settings turn solid green with white text on hover/focus, Log out
 * turns solid red with white text on hover/focus.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => setLoggedIn(isLoggedIn());
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Close the drawer whenever the route changes (e.g. tapping a link).
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // No header chrome on the auth screens themselves.
  if (pathname === "/login" || pathname === "/signup") return null;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/tax/dashboard" className="flex items-center gap-2">
          <TaxRocketLogo />
        </Link>

        {/* Reserve the space even pre-mount so nothing jumps on hydration. */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {!mounted ? null : (
            <>
              {loggedIn && (
                <>
                  {/* Notification bell — theme-colored, working dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Notifications"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-[#376952] transition-colors hover:bg-[#376952]/10"
                      >
                        <Bell className="h-[18px] w-[18px]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Notifications
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        No new notices. FBR notices will show up here.
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              {/* Help — always visible regardless of auth state.
                  Placeholder for now, intentionally not wired up yet. */}
              <button
                type="button"
                aria-label="Help"
                title="Coming soon"
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-500"
              >
                <HelpCircle className="h-[18px] w-[18px]" />
              </button>

              {loggedIn ? (
                /* Profile dropdown */
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Account menu"
                      className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#376952] text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                    >
                      {getInitials(DEMO_USER.name)}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="text-sm font-medium text-foreground">
                        {DEMO_USER.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {DEMO_USER.email}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      asChild
                      className="cursor-pointer hover:bg-[#376952] hover:text-white focus:bg-[#376952] focus:text-white"
                    >
                      <Link
                        href="/tax/profile"
                        className="flex items-center gap-2"
                      >
                        <UserRound className="h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      asChild
                      className="cursor-pointer hover:bg-[#376952] hover:text-white focus:bg-[#376952] focus:text-white"
                    >
                      <Link
                        href="/tax/settings"
                        className="flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="flex cursor-pointer items-center gap-2 text-red-500 hover:bg-red-500 hover:text-white focus:bg-red-500 focus:text-white"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-lg bg-[#376952] px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2e5a44]"
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </>
          )}

          {/* Hamburger — mobile & tablet only, opens the slide-in nav drawer */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full text-[#376952] transition-colors hover:bg-[#376952]/10 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      <MobileNavDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
    </header>
  );
}
