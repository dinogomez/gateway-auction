"use client";

import { Info, X } from "lucide-react";
import { useEffect, useState } from "react";

const COOKIE_NAME = "effects-banner-dismissed";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  const isSecure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax${isSecure ? ";Secure" : ""}`;
}

export function EffectsBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if banner was dismissed
    const dismissed = getCookie(COOKIE_NAME);
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setCookie(COOKIE_NAME, "true", 365); // Remember for 1 year
  };

  if (!isVisible) return null;

  return (
    <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-center gap-2 relative">
      <Info className="w-4 h-4 shrink-0" />
      <span className="text-sm font-mono">
        Effects can be disabled in settings
      </span>
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-blue-700 rounded transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
