"use client";

import { useSettings } from "@/hooks/useSettings";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

export function AudioSettings() {
  const { audio, setMasterVolume, setMusicVolume, setSfxVolume } =
    useSettings();

  return (
    <div className="space-y-4">
      {/* Master Volume */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500" />
            <Label className="text-xs font-mono">Master Volume</Label>
          </div>
          <span className="text-xs font-mono text-neutral-600 tabular-nums">
            {(audio.masterVolume * 100).toFixed(0)}%
          </span>
        </div>
        <Slider
          value={[audio.masterVolume]}
          onValueChange={([v]) => setMasterVolume(v)}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      {/* Music Volume */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500" />
            <Label className="text-xs font-mono">Music</Label>
          </div>
          <span className="text-xs font-mono text-neutral-600 tabular-nums">
            {(audio.musicVolume * 100).toFixed(0)}%
          </span>
        </div>
        <Slider
          value={[audio.musicVolume]}
          onValueChange={([v]) => setMusicVolume(v)}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      {/* SFX Volume */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500" />
            <Label className="text-xs font-mono">Sound Effects</Label>
          </div>
          <span className="text-xs font-mono text-neutral-600 tabular-nums">
            {(audio.sfxVolume * 100).toFixed(0)}%
          </span>
        </div>
        <Slider
          value={[audio.sfxVolume]}
          onValueChange={([v]) => setSfxVolume(v)}
          min={0}
          max={1}
          step={0.05}
        />
      </div>
    </div>
  );
}
