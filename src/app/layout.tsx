import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { Toaster } from "@/shared/ui/sonner";
import { cn } from "@/shared/lib/utils";
import { ar } from "@/shared/i18n/ar";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: ar.app.name,
    template: `%s · ${ar.app.name}`,
  },
  description: ar.app.description,
  // The whole product is behind auth except /lookup, which opts out explicitly too.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Attendance marking happens on phones; pinch-zoom must stay available.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cn(cairo.variable, "h-full antialiased")}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
