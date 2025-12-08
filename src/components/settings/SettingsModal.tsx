"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DisplaySettings } from "./DisplaySettings";
import { AudioSettings } from "./AudioSettings";
import { useSettings } from "@/hooks/useSettings";

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const { resetToDefaults } = useSettings();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px] bg-white border-neutral-900">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">SETTINGS</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Display Section */}
          <div>
            <h3 className="text-sm font-mono font-bold text-neutral-700 mb-3 flex items-center gap-2">
              <span className="text-base">DISPLAY</span>
            </h3>
            <DisplaySettings />
          </div>

          {/* Audio Section */}
          <div className="pt-4 border-t border-neutral-200">
            <h3 className="text-sm font-mono font-bold text-neutral-700 mb-3 flex items-center gap-2">
              <span className="text-base">AUDIO</span>
            </h3>
            <AudioSettings />
          </div>

          {/* Reset Button */}
          <div className="pt-4 border-t border-neutral-200">
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefaults}
              className="w-full font-mono text-xs rounded-none"
            >
              Reset to Defaults
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
