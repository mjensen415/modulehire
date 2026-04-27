import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--mono",
});

export const metadata: Metadata = {
  title: "ModuleHire Labs",
  description: "AI Resume & Job Module Orchestration",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><path d='M20 4L8 24' stroke='%231d9e75' stroke-width='2.5' stroke-linecap='round'/><rect x='2' y='4' width='10' height='10' rx='2' fill='%231d9e75' opacity='0.3'/><rect x='16' y='14' width='10' height='10' rx='2' fill='%231d9e75'/></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
