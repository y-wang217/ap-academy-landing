import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Summer Intensive | 95+ Guarantee | AP Academy",
  description:
    "10 focused 1-hour lessons for $600. Grade 11 & 12 Math, Physics, Chemistry, Biology, and English. 95+ guarantee on our AP-issued final — or we keep teaching at no extra cost.",
  keywords: [
    "summer tutoring",
    "Grade 11 tutoring",
    "Grade 12 tutoring",
    "math tutoring GTA",
    "physics tutoring",
    "chemistry tutoring",
    "biology tutoring",
    "English tutoring",
    "IB tutoring",
    "summer intensive",
    "Toronto tutor",
    "Markham tutor",
    "Richmond Hill tutor",
  ],
  authors: [{ name: "AP Academy" }],
  creator: "AP Academy",
  publisher: "AP Academy",
  metadataBase: new URL("https://ap-academy-landing.vercel.app"),
  alternates: {
    canonical: "https://ap-academy-landing.vercel.app",
  },
  openGraph: {
    title: "Summer Intensive | 95+ Guarantee | AP Academy",
    description:
      "10 focused 1-hour lessons. Grade 11 & 12 Math, Physics, Chemistry, Biology, English. 95+ guarantee.",
    url: "https://ap-academy-landing.vercel.app",
    siteName: "AP Academy",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Summer Intensive | 95+ Guarantee | AP Academy",
    description:
      "10 focused 1-hour lessons. 95+ guarantee on our AP-issued final.",
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
                "AP Academy offers summer intensive tutoring for Grade 11 & 12 students in Math, Physics, Chemistry, Biology, and English. 10 × 1-hour lessons with a 95+ guarantee.",
              url: "https://ap-academy-landing.vercel.app",
              email: "y.wang217@gmail.com",
              telephone: "+1-519-589-8217",
              areaServed: [
                { "@type": "City", name: "Toronto" },
                { "@type": "City", name: "Markham" },
                { "@type": "City", name: "Richmond Hill" },
                { "@type": "City", name: "Vaughan" },
                { "@type": "City", name: "Newmarket" },
                { "@type": "City", name: "Mississauga" },
              ],
              priceRange: "$$",
              serviceType: [
                "Summer Intensive Tutoring",
                "Math Tutoring",
                "Physics Tutoring",
                "Chemistry Tutoring",
                "Biology Tutoring",
                "English Tutoring",
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
