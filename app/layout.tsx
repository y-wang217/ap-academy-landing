import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summer Intensive | 95+ Guarantee | AP Academy",
  description:
    "10 focused 1-hour lessons for $600. Grade 11 & 12 Math, Physics, Chemistry, and English. 95+ guarantee on our AP-issued final — or we keep teaching at no extra cost.",
  keywords: [
    "summer tutoring",
    "Grade 11 tutoring",
    "Grade 12 tutoring",
    "math tutoring GTA",
    "physics tutoring",
    "chemistry tutoring",
    "English tutoring",
    "calculus tutoring",
    "advanced functions tutoring",
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
      "10 focused 1-hour lessons. Grade 11 & 12 Math, Physics, Chemistry, English. 95+ guarantee.",
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
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Hanken+Grotesk:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "EducationalOrganization",
              name: "AP Academy",
              description:
                "AP Academy offers summer intensive tutoring for Grade 11 & 12 students in Math, Physics, Chemistry, and English. 10 × 1-hour lessons with a 95+ guarantee.",
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
                "Calculus Tutoring",
                "Advanced Functions Tutoring",
                "Physics Tutoring",
                "Chemistry Tutoring",
                "English Tutoring",
              ],
            }),
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
