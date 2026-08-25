import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bora Marcá — Pátio Automotive",
  description: "Operação de estética automotiva em tempo real.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
