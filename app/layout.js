import { Zen_Old_Mincho, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const zenOldMincho = Zen_Old_Mincho({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Kukan — Early Access",
  description: "The space between your keyframes, animated by AI.",
  icons: {
    icon: "/kukan-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body
        className={`${zenOldMincho.variable} ${inter.variable} ${plexMono.variable} bg-white text-black font-body antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
