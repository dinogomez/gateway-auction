"use client";

import { AudioLines } from "@/components/animate-ui/icons/audio-lines";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { useAudioSettings } from "@/hooks/useSettings";
import { useSounds } from "@/hooks/useSounds";
import { cn } from "@/lib/utils";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

interface MusicIndicatorProps {
  track: "menu" | "game";
}

const TRACK_INFO = {
  menu: {
    title: "Jazz Music",
    artist: "Maksym Malko",
  },
  game: {
    title: "Bass Vibes",
    artist: "Kevin MacLeod",
  },
};

export function MusicIndicator({ track }: MusicIndicatorProps) {
  const info = TRACK_INFO[track];
  const { isMuted, toggleMute } = useSounds();
  const audioSettings = useAudioSettings();

  // Animation should stop if muted OR if music volume is 0
  const shouldAnimate = !isMuted && audioSettings.musicVolume > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggleMute}
          className={cn(
            "h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors hover:cursor-pointer",
            isMuted
              ? "hover:bg-neutral-200 text-neutral-400"
              : "hover:bg-neutral-100",
          )}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          <AudioLines size={16} animate={shouldAnimate} loop />
        </button>
      </TooltipTrigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          sideOffset={4}
          className="z-50 bg-white border border-neutral-900 px-3 py-1.5 animate-in fade-in-0 zoom-in-95"
        >
          <div className="text-xs font-mono">
            <div className="font-bold text-neutral-900">
              {isMuted ? "Muted" : info.title}
            </div>
            <div className="text-neutral-500">
              {isMuted ? "Click to unmute" : info.artist}
            </div>
          </div>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}
