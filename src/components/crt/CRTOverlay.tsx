"use client";

import { useDisplaySettings } from "@/hooks/useSettings";
import { CRT_VALUES } from "@/types/settings";

/**
 * CSS-based CRT overlay effects
 * - Scanlines
 * - Vignette
 */
export function CRTOverlay() {
  const settings = useDisplaySettings();

  if (!settings.crtEnabled) {
    return null;
  }

  const scanlineOpacity = CRT_VALUES.scanlines * 0.3;
  const vignetteOpacity = CRT_VALUES.vignette;

  return (
    <div
      className="crt-overlay"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 99999,
      }}
    >
      {/* Scanlines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, ${scanlineOpacity}),
            rgba(0, 0, 0, ${scanlineOpacity}) 1px,
            transparent 1px,
            transparent 2px
          )`,
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(
            ellipse at center,
            transparent 0%,
            transparent 40%,
            rgba(0, 0, 0, ${vignetteOpacity}) 100%
          )`,
        }}
      />
    </div>
  );
}
