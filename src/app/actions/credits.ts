"use server";

import { unstable_cache } from "next/cache";

interface CreditsData {
  percentage: number;
  remaining: number;
  limit: number;
  used: number;
}

const fetchCreditsFromAPI = async (): Promise<CreditsData | null> => {
  const apiKey =
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;

  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/credits", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const credits = await response.json();

    // API returns: { balance: "16.81", total_used: "3.19" }
    // Balance is always out of $20
    const limit = 20;
    const balance = parseFloat(credits.balance) || 0;
    const used = parseFloat(credits.total_used) || 0;
    const percentage = Math.round((balance / limit) * 100);

    return {
      percentage,
      remaining: balance,
      limit,
      used,
    };
  } catch {
    return null;
  }
};

// Cache for 4 hours (14400 seconds)
const getCachedCredits = unstable_cache(
  fetchCreditsFromAPI,
  ["gateway-credits"],
  { revalidate: 14400 },
);

export async function getCredits(): Promise<CreditsData | null> {
  return getCachedCredits();
}
