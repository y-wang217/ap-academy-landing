import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Waterloo Engineering Tutor GTA | Grade 11 Math & Physics | AP Academy",
  description:
    "AP Academy prepares Grade 11 students for Waterloo Engineering admission. 1-on-1 math and physics tutoring with parent progress updates. Built by a Waterloo Software Engineering grad. Book a free strategy call.",
  keywords: [
    "Waterloo Engineering tutor",
    "Grade 11 tutoring",
    "Grade 12 tutoring",
    "Physics tutoring GTA",
    "Math tutoring GTA",
    "Advanced Functions tutor",
    "Euclid prep",
    "AIF coaching",
    "Markham tutor",
    "Richmond Hill tutor",
    "Vaughan tutor",
    "Toronto tutor",
    "STEM admissions",
  ],
  authors: [{ name: "AP Academy" }],
  creator: "AP Academy",
  publisher: "AP Academy",
  metadataBase: new URL("https://ap-academy-landing.vercel.app"),
  alternates: {
    canonical: "https://ap-academy-landing.vercel.app",
  },
  openGraph: {
    title: "Waterloo Engineering Tutor | AP Academy",
    description:
      "AP Academy prepares Grade 11 students for Waterloo Engineering admission. 1-on-1 math and physics tutoring with parent progress updates. Built by a Waterloo Software Engineering grad. Book a free strategy call.",
    url: "https://ap-academy-landing.vercel.app",
    siteName: "AP Academy",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Waterloo Engineering Tutor | AP Academy",
    description:
      "AP Academy prepares Grade 11 students for Waterloo Engineering admission. 1-on-1 math and physics tutoring with parent progress updates. Built by a Waterloo Software Engineering grad.",
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
                "AP Academy prepares Grade 11-12 students for Waterloo Engineering admission through 1-on-1 math and physics tutoring, Euclid prep, AIF coaching, and interview drills.",
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
                "Math Tutoring",
                "Physics Tutoring",
                "University Admission Coaching",
                "Euclid Contest Prep",
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
