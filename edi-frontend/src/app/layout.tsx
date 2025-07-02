import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { StagewiseToolbar } from "@stagewise/toolbar-next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EDI.ai - Intelligent Data Analysis",
  description: "Your personal AI-powered data analysis assistant.",
};

const stagewiseConfig = {
  plugins: []
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
        {process.env.NODE_ENV === 'development' && (
          <StagewiseToolbar config={stagewiseConfig} />
        )}
      </body>
    </html>
  );
}
