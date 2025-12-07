"use client";

import { GameErrorBoundary } from "@/components/ErrorBoundary";

export default function PokerGameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GameErrorBoundary>{children}</GameErrorBoundary>;
}
