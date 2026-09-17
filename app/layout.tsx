import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev Router Lab",
  description: "Jev decides which tool or model fits a request. Your code executes it. A TypeSafe Jev routing demo.",
};

/** Apply a saved theme before first paint. Dark is the default. */
const themeScript = `(function(){try{var t=localStorage.getItem("jev-router:theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <main>{children}</main>
      </body>
    </html>
  );
}
