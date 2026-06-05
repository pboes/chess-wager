import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/wallet/wallet-provider";

// Self-hosted at build time (no runtime font requests → no CSP changes).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chess Wager — Circles Mini-App",
  description:
    "Challenge a connected player, stake gCRC, play on Lichess. Winner takes the pot.",
  icons: {
    icon: "/chess-puzzle-avatar-512.png",
    apple: "/chess-puzzle-avatar-512.png",
  },
  openGraph: {
    title: "Chess Wager",
    description: "Stake gCRC, play on Lichess, winner takes the pot. A Circles mini-app.",
    images: ["/chess-puzzle-avatar-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf5f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>
        <WalletProvider>
          <div className="min-h-dvh px-4 pb-12 pt-5">
            <main>{children}</main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
