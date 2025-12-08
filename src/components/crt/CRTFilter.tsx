"use client";

import { CRT_VALUES } from "@/types/settings";

/**
 * SVG Filter for CRT chromatic aberration - applied natively by browser at 60fps
 * Separates RGB channels and offsets them slightly for that CRT color fringing look
 */
export function CRTFilter() {
  const aberration = CRT_VALUES.chromaticAberration;

  return (
    <svg
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      <defs>
        {/* Chromatic aberration - separate and offset RGB channels */}
        <filter id="crt-combined" x="-2%" y="-2%" width="104%" height="104%">
          {/* Red channel - offset left */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="red"
          />
          <feOffset in="red" dx={-aberration} dy="0" result="red-shifted" />

          {/* Green channel - no offset (center) */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0
                    0 1 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="green"
          />

          {/* Blue channel - offset right */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 1 0 0
                    0 0 0 1 0"
            result="blue"
          />
          <feOffset in="blue" dx={aberration} dy="0" result="blue-shifted" />

          {/* Combine all channels using lighter blend */}
          <feBlend mode="lighten" in="red-shifted" in2="green" result="rg" />
          <feBlend mode="lighten" in="rg" in2="blue-shifted" />
        </filter>
      </defs>
    </svg>
  );
}
