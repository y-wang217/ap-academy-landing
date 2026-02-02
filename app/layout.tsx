import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AP Academy | Waterloo Engineering Prep for Grade 11 Students",
  description:
    "Get your Grade 11 student into Waterloo Engineering. Specialized tutoring in Physics & Advanced Functions. Raise grades from 70-85% to 85-90%+.",
  keywords: [
    "Waterloo Engineering",
    "Grade 11 tutoring",
    "Physics tutoring",
    "Advanced Functions",
    "GTA tutoring",
    "university prep",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
