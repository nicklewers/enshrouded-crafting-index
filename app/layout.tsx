import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enshrouded Crafting Index",
  description: "Search and browse crafting recipes from the Enshrouded wiki.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
