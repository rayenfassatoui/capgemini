import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { I18nProvider } from "@/components/shared/i18n-provider";
import { cookies, headers } from "next/headers";
import "streamdown/styles.css";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

type CookieStoreLike = {
  get: (name: string) => { value?: string } | undefined;
};

type HeaderStoreLike = {
  get: (name: string) => string | null;
};

async function readLocaleFromRequest(): Promise<string | undefined> {
  const maybeCookieStore = await Promise.resolve(cookies() as unknown);

  if (
    maybeCookieStore &&
    typeof maybeCookieStore === "object" &&
    "get" in maybeCookieStore &&
    typeof (maybeCookieStore as CookieStoreLike).get === "function"
  ) {
    return (maybeCookieStore as CookieStoreLike).get("app-locale")?.value;
  }

  const maybeHeaderStore = await Promise.resolve(headers() as unknown);
  if (
    maybeHeaderStore &&
    typeof maybeHeaderStore === "object" &&
    "get" in maybeHeaderStore &&
    typeof (maybeHeaderStore as HeaderStoreLike).get === "function"
  ) {
    const cookieHeader = (maybeHeaderStore as HeaderStoreLike).get("cookie") ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)app-locale=(en|fr)(?:;|$)/i);
    return match?.[1];
  }

  return undefined;
}

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Capgemini Talent Intelligence",
  description:
    "AI-assisted candidate evaluation and interview preparation platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieLocale = await readLocaleFromRequest();
  const locale = cookieLocale === "fr" || cookieLocale === "en" ? cookieLocale : "en";

  return (
    <html lang={locale} className={dmSans.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <TooltipProvider>
          <ThemeProvider>
            <I18nProvider defaultLocale={locale}>
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
              >
                Skip to main content
              </a>
              {children}
              <Toaster position="bottom-right" />
            </I18nProvider>
          </ThemeProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
