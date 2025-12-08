"use client";

import type { ReactNode } from "react";
import { useDisplaySettings } from "@/hooks/useSettings";
import { CRTOverlay } from "./CRTOverlay";
import { CRTFilter } from "./CRTFilter";

interface CRTEffectProps {
  children: ReactNode;
}

/**
 * CRT Effect wrapper component - SVG filters for 60fps
 * Always renders same structure to prevent modal closing on toggle
 *
 * All effects enabled together:
 * - Chromatic aberration (SVG RGB channel separation)
 * - Scanlines (CSS overlay)
 * - Vignette (CSS overlay)
 */
export function CRTEffect({ children }: CRTEffectProps) {
  const settings = useDisplaySettings();
  const enabled = settings.crtEnabled;

  return (
    <div
      className="crt-screen"
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: enabled ? "hidden" : undefined,
        background: enabled ? "#000" : undefined,
      }}
    >
      {/* SVG filter definitions - always present */}
      <CRTFilter />

      {/* Content with conditional SVG filter */}
      <div
        style={{
          filter: enabled ? "url(#crt-combined)" : undefined,
          minHeight: "100vh",
        }}
      >
        {children}
      </div>

      {/* CSS overlay effects (scanlines + vignette) - conditionally rendered inside */}
      <CRTOverlay />
    </div>
  );
}
