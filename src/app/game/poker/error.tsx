"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PokerError({ error, reset }: ErrorBoundaryProps) {
  const router = useRouter();

  useEffect(() => {
    console.error("Poker game error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-700 p-8 text-center">
        <h2 className="text-2xl font-bold text-white font-mono mb-4">
          GAME ERROR
        </h2>
        <p className="text-neutral-400 font-mono text-sm mb-6">
          Something went wrong during the game. Your progress may have been
          lost.
        </p>
        {error.message && (
          <p className="text-red-500 font-mono text-xs mb-6 bg-neutral-950 p-3 border border-neutral-800 overflow-auto max-h-32">
            {error.message}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-3 bg-white text-black font-mono font-bold hover:bg-neutral-200 transition-colors"
          >
            TRY AGAIN
          </button>
          <button
            type="button"
            onClick={() => {
              // Clean up session data before navigating home
              sessionStorage.removeItem("selectedModels");
              sessionStorage.removeItem("pokerHumanMode");
              router.push("/");
            }}
            className="px-6 py-3 bg-neutral-800 text-white font-mono font-bold hover:bg-neutral-700 transition-colors border border-neutral-600"
          >
            HOME
          </button>
        </div>
      </div>
    </div>
  );
}
