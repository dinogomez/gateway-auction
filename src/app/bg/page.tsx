"use client";

import { CardBackground } from "@/components/CardBackground";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect } from "react";

export default function BackgroundPage() {
  const [seed, setSeed] = useQueryState("seed", parseAsInteger);

  // Auto-generate seed if not present
  useEffect(() => {
    if (seed === null) {
      setSeed(Math.floor(Math.random() * 1000000000));
    }
  }, [seed, setSeed]);

  // Don't render until seed is set
  if (seed === null) return null;

  return (
    <div className="min-h-screen bg-neutral-100 relative">
      <CardBackground cardCount={30} opacity={1} seed={seed} cardScale={1.8} />
    </div>
  );
}
