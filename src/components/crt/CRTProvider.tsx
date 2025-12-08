"use client";

import type { ReactNode } from "react";
import { CRTEffect } from "./CRTEffect";

interface CRTProviderProps {
  children: ReactNode;
}

/**
 * Client wrapper for CRTEffect to use in Server Component layouts
 */
export function CRTProvider({ children }: CRTProviderProps) {
  return <CRTEffect>{children}</CRTEffect>;
}
