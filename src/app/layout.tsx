import type { Metadata } from "next";
import { AuthProvider } from "@/ce/auth-ui";
import { Analytics } from "@vercel/analytics/next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${BRAND.name} | AI Control Platform`,
  description:
    "Assess and control enterprise AI use cases - what they can see, decide, and do.",
  icons: { icon: BRAND.faviconUrl },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider>
      <html lang="en" data-theme={BRAND.theme}>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{if(localStorage.getItem('neo-theme')==='light')document.documentElement.classList.add('theme-light')}catch(e){}",
            }}
          />
        </head>
        <body className="bg-slate-50 text-ink antialiased">
          {children}
          <Analytics />
        </body>
      </html>
    </AuthProvider>
  );
}
