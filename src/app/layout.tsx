import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// Bundled, not next/font/google: fetching from Google at build time intermittently failed Vercel builds.
const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-variable.woff2",
  weight: "200 800",
  variable: "--font",
});

const mono = localFont({
  src: "./fonts/jetbrains-mono-variable.woff2",
  weight: "100 800",
  variable: "--mono",
  fallback: ["ui-monospace", "monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "ModuleHire Labs",
  description: "AI Resume & Job Module Orchestration",
  icons: {
    icon: [
      { url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><path d='M20 4L8 24' stroke='%231d9e75' stroke-width='2.5' stroke-linecap='round'/><rect x='2' y='4' width='10' height='10' rx='2' fill='%231d9e75' opacity='0.3'/><rect x='16' y='14' width='10' height='10' rx='2' fill='%231d9e75'/></svg>", type: "image/svg+xml" },
      { url: "/modulehire-icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/modulehire-apple-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakarta.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* Blocking script — applies saved theme before first paint to prevent flash */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('mh-theme')||(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t)}catch(e){}})()` }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
