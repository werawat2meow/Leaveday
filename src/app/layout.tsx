import type { Metadata } from "next";
import "./globals.css";
import "react-datepicker/dist/react-datepicker.css";
import Providers from "./providers";


export const metadata: Metadata = { 
  title: "Leave Management System", 
  description: "ระบบวันลา",
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  }
 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th-TH" className="theme-dark" suppressHydrationWarning>
      <body className="min-h-dvh text-[var(--text)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

