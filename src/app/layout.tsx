import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { CRTProvider } from "@/components/crt/CRTProvider";
import { EffectsBanner } from "@/components/EffectsBanner";
import { MobileBlocker } from "@/components/MobileBlocker";
import { env, isDevMode } from "@/env";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gateway Poker - AI Model Evaluation",
  description:
    "Watch AI models compete in Texas Hold'em Poker. See how different AI models make strategic decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {isDevMode() && (
          <>
            <Script
              src="//unpkg.com/react-grab/dist/index.global.js"
              strategy="beforeInteractive"
            />
            <Script
              src="//unpkg.com/@react-grab/claude-code/dist/client.global.js"
              strategy="lazyOnload"
            />
          </>
        )}
        {/* Umami Analytics */}
        <Script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="16dd73ae-6c17-4662-bb59-ded86601e308"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-neutral-100 text-neutral-900 min-h-screen`}
      >
        <NuqsAdapter>
          <MobileBlocker>
            <EffectsBanner />
            <CRTProvider>
              <ConvexClientProvider>{children}</ConvexClientProvider>
            </CRTProvider>
          </MobileBlocker>
        </NuqsAdapter>
      </body>
    </html>
  );
}
