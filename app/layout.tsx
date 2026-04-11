import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MHF4U Intensive | Get 95+ Before School Starts | AP Academy",
  description:
    "Master Grade 12 Advanced Functions in 10 days before the semester begins. Only 5 spots per session. Small group, full curriculum coverage. Start the semester ahead, not catching up. Book your spot.",
  keywords: [
    "MHF4U tutoring",
    "Grade 12 Advanced Functions",
    "MHF4U intensive",
    "math tutoring GTA",
    "Advanced Functions tutor",
    "MHF4U course",
    "Grade 12 math prep",
    "summer math intensive",
    "Markham tutor",
    "Richmond Hill tutor",
    "Vaughan tutor",
    "Toronto tutor",
    "get ahead in math",
  ],
  authors: [{ name: "AP Academy" }],
  creator: "AP Academy",
  publisher: "AP Academy",
  metadataBase: new URL("https://ap-academy-landing.vercel.app"),
  alternates: {
    canonical: "https://ap-academy-landing.vercel.app",
  },
  openGraph: {
    title: "MHF4U Intensive | Get 95+ Before School Starts",
    description:
      "Master Grade 12 Advanced Functions in 10 days before the semester begins. Only 5 spots per session. Book your spot.",
    url: "https://ap-academy-landing.vercel.app",
    siteName: "AP Academy",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MHF4U Intensive | Get 95+ Before School Starts",
    description:
      "Master Grade 12 Advanced Functions in 10 days before the semester begins. Only 5 spots per session.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* JSON-LD Structured Data for LocalBusiness */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "EducationalOrganization",
              name: "AP Academy",
              description:
                "AP Academy offers a 10-day MHF4U intensive program to help Grade 12 students master Advanced Functions before the semester begins. Small groups, full curriculum coverage, 95+ results.",
              url: "https://ap-academy-landing.vercel.app",
              email: "y.wang217@gmail.com",
              telephone: "+1-519-589-8217",
              areaServed: [
                {
                  "@type": "City",
                  name: "Toronto",
                },
                {
                  "@type": "City",
                  name: "Markham",
                },
                {
                  "@type": "City",
                  name: "Richmond Hill",
                },
                {
                  "@type": "City",
                  name: "Vaughan",
                },
                {
                  "@type": "City",
                  name: "Newmarket",
                },
                {
                  "@type": "City",
                  name: "Mississauga",
                },
              ],
              priceRange: "$$",
              serviceType: [
                "MHF4U Intensive",
                "Grade 12 Advanced Functions Tutoring",
                "Math Intensive Program",
              ],
            }),
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
