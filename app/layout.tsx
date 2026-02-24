import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AP Academy | Waterloo Engineering Prep for Grade 11–12",
  description:
    "We get Grade 11–12 students into Waterloo Engineering. 90+ in math and physics. Euclid prep. AIF coaching. Interview drills. Built by a Waterloo Engineering grad.",
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
