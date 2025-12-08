"use client";

import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";

export function DisplaySettings() {
  const { display, setCrtEnabled } = useSettings();

  return (
    <div className="flex items-center gap-3">
      <input
        type="checkbox"
        id="crt-toggle"
        checked={display.crtEnabled}
        onChange={(e) => setCrtEnabled(e.target.checked)}
        className="w-4 h-4 accent-neutral-900"
      />
      <Label htmlFor="crt-toggle" className="text-sm font-mono cursor-pointer">
        Enable Effects
      </Label>
    </div>
  );
}
