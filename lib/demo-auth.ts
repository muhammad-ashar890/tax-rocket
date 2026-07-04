"use client";

/**
 * demo-auth — lightweight, client-only auth simulation for the preview
 * build. No real backend call happens here; it just persists a flag in
 * localStorage so the header, login, and signup screens can agree on
 * whether the visitor is "signed in" for the purposes of this demo.
 *
 * Mirrors the existing `lib/demo-store.ts` pattern: a localStorage key
 * plus a same-tab custom event (storage events alone don't fire in the
 * tab that made the change).
 */

const AUTH_KEY = "taxrocket-demo-auth";
export const AUTH_EVENT = "taxrocket-demo-auth-changed";

export type DemoUser = {
  name: string;
  email: string;
};

export const DEMO_USER: DemoUser = {
  name: "TX",
  email: "tx@technexia.co",
};

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_KEY) === "true";
}

export function login() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_KEY, "true");
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function logout() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
