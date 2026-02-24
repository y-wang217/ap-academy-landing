import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AP Academy | Get Into Waterloo Engineering | Grade 11-12 Tutoring",
  description:
    "We get Grade 11-12 students into Waterloo Engineering. 1-on-1 math and physics tutoring, Euclid prep, AIF coaching, and interview drills. Book a free strategy call.",
  keywords: [
    "Waterloo Engineering",
    "Grade 11 tutoring",
    "Grade 12 tutoring",
    "Physics tutoring",
    "Advanced Functions",
    "Euclid prep",
    "AIF coaching",
    "GTA tutoring",
    "university prep",
    "STEM admissions",
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
