import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — AP Academy",
  description:
    "How AP Academy collects, uses, and protects your personal information.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://ap-academy-landing.vercel.app/privacy",
  },
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80">
            <Image
              src="/logo.png"
              alt="AP Academy"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <span className="font-semibold text-text-primary">AP Academy</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 py-12 md:py-16">
        <article className="prose mx-auto max-w-[720px]">
          <h1
            id="ap-academy-privacy-policy"
            className="mb-4 text-[32px] font-bold text-navy md:text-[40px]"
          >
            AP Academy — Privacy Policy
          </h1>

          <p className="mb-2 text-text-secondary">
            <strong className="text-text-primary">Effective date:</strong> April
            13, 2026
          </p>
          <p className="mb-8 text-text-secondary">
            <strong className="text-text-primary">Last updated:</strong> April
            13, 2026
          </p>

          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            AP Academy (&quot;AP Academy,&quot; &quot;we,&quot; &quot;our,&quot;
            or &quot;us&quot;) respects your privacy. This Privacy Policy
            explains what information we collect, how we use it, and the choices
            you have. It applies to our website, our Meta (Facebook/Instagram)
            Lead Ads forms, and any services offered under the AP Academy name.
          </p>

          <p className="mb-8 text-[17px] leading-[1.7] text-text-primary">
            We are based in Ontario, Canada, and comply with Canada&apos;s
            Personal Information Protection and Electronic Documents Act
            (PIPEDA) and Canada&apos;s Anti-Spam Legislation (CASL).
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="who-we-are"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#who-we-are" className="hover:text-accent">
              1. Who we are
            </a>
          </h2>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            AP Academy is a private tutoring service that helps Grade 10–12
            students prepare for competitive Canadian STEM university programs,
            including the University of Waterloo Engineering program. The
            business is operated by Charlie Wang.
          </p>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            <strong className="text-text-primary">Contact:</strong>{" "}
            <a
              href="mailto:y.wang217@gmail.com"
              className="text-accent hover:underline"
            >
              y.wang217@gmail.com
            </a>
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="information-we-collect"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#information-we-collect" className="hover:text-accent">
              2. Information we collect
            </a>
          </h2>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            We collect only what we need to respond to inquiries, deliver
            tutoring services, and improve our programs.
          </p>

          <p className="mb-2 text-[17px] font-semibold leading-[1.7] text-text-primary">
            You give us directly (via our website, Meta Instant Forms, Calendly,
            or email):
          </p>
          <ul className="mb-6 ml-6 list-disc space-y-1 text-[17px] leading-[1.7] text-text-primary">
            <li>Parent full name</li>
            <li>Email address</li>
            <li>Phone number</li>
            <li>Student&apos;s grade level and school</li>
            <li>Student&apos;s current math grade or mark range</li>
            <li>Optional notes about your goals or concerns</li>
          </ul>

          <p className="mb-2 text-[17px] font-semibold leading-[1.7] text-text-primary">
            We collect automatically when you visit our website:
          </p>
          <ul className="mb-6 ml-6 list-disc space-y-1 text-[17px] leading-[1.7] text-text-primary">
            <li>Browser type, device type, and approximate location (city-level)</li>
            <li>Pages viewed and time on page</li>
            <li>Referring URL (e.g., which ad you came from)</li>
            <li>Anonymous analytics identifiers (cookies / Meta Pixel)</li>
          </ul>

          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            We do <strong>not</strong> knowingly collect information directly
            from children under the age of 13 through our marketing forms.
            Parents provide student information on behalf of their child.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="how-we-use-your-information"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#how-we-use-your-information" className="hover:text-accent">
              3. How we use your information
            </a>
          </h2>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            We use the information we collect to:
          </p>
          <ul className="mb-6 ml-6 list-disc space-y-1 text-[17px] leading-[1.7] text-text-primary">
            <li>Respond to your inquiry and schedule a discovery call</li>
            <li>
              Send you dates, pricing, and program details for AP Academy
              programs
            </li>
            <li>Deliver the tutoring services you&apos;ve signed up for</li>
            <li>
              Send follow-up emails or SMS about your inquiry or enrollment
            </li>
            <li>
              Measure the performance of our advertising and improve our offers
            </li>
            <li>Comply with legal obligations</li>
          </ul>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            We will <strong>never</strong> sell your personal information.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="legal-basis-and-consent"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#legal-basis-and-consent" className="hover:text-accent">
              4. Legal basis and consent (PIPEDA / CASL)
            </a>
          </h2>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            By submitting a Meta Instant Form, a contact form on our website, or
            booking a Calendly call, you give us{" "}
            <strong>express consent</strong> to contact you by email, SMS, or
            phone about AP Academy programs.
          </p>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            You can withdraw consent at any time by:
          </p>
          <ul className="mb-6 ml-6 list-disc space-y-1 text-[17px] leading-[1.7] text-text-primary">
            <li>Replying STOP to any SMS we send</li>
            <li>Clicking &quot;unsubscribe&quot; at the bottom of any email</li>
            <li>
              Emailing{" "}
              <a
                href="mailto:y.wang217@gmail.com"
                className="text-accent hover:underline"
              >
                y.wang217@gmail.com
              </a>{" "}
              with the subject line &quot;Unsubscribe&quot;
            </li>
          </ul>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            Withdrawing consent will not affect services you are already
            enrolled in.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="who-we-share-information-with"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a
              href="#who-we-share-information-with"
              className="hover:text-accent"
            >
              5. Who we share information with
            </a>
          </h2>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            We share information only with service providers we use to run the
            business. These providers are contractually required to protect your
            information and use it only for the purposes we specify.
          </p>
          <p className="mb-2 text-[17px] font-semibold leading-[1.7] text-text-primary">
            Current service providers:
          </p>
          <ul className="mb-6 ml-6 list-disc space-y-1 text-[17px] leading-[1.7] text-text-primary">
            <li>
              <strong>Meta Platforms, Inc.</strong> — Lead Ads, Pixel,
              advertising analytics
            </li>
            <li>
              <strong>Google LLC</strong> — Google Workspace (email), Calendar,
              Meet
            </li>
            <li>
              <strong>Calendly</strong> — discovery call scheduling
            </li>
            <li>
              <strong>Notion Labs, Inc.</strong> — internal CRM / lead tracking
            </li>
            <li>
              <strong>Zapier, Inc.</strong> — automation between the tools above
            </li>
            <li>
              <strong>Vercel Inc.</strong> — website hosting
            </li>
          </ul>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            Some of these providers store data outside Canada (primarily in the
            United States). By using our services, you consent to this
            cross-border transfer.
          </p>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            We may also disclose information if required by law, court order, or
            to protect the rights, property, or safety of AP Academy, our
            students, or the public.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="cookies-and-tracking"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#cookies-and-tracking" className="hover:text-accent">
              6. Cookies and tracking
            </a>
          </h2>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            Our website uses cookies and the Meta Pixel to measure ad
            performance and understand how visitors use the site. You can
            disable cookies in your browser settings, but some parts of the site
            may not work as intended.
          </p>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            We do <strong>not</strong> use cookies to build advertising profiles
            of minors.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="how-long-we-keep-information"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a
              href="#how-long-we-keep-information"
              className="hover:text-accent"
            >
              7. How long we keep information
            </a>
          </h2>
          <ul className="mb-6 ml-6 list-disc space-y-1 text-[17px] leading-[1.7] text-text-primary">
            <li>
              <strong>Active leads and clients:</strong> for as long as you are
              engaged with AP Academy, plus 2 years after the last contact.
            </li>
            <li>
              <strong>Unconverted leads:</strong> up to 18 months after your
              last interaction, then deleted or anonymized.
            </li>
            <li>
              <strong>Financial and tax records:</strong> 7 years, as required
              by the Canada Revenue Agency.
            </li>
          </ul>

          <hr className="my-8 border-border" />

          <h2
            id="how-we-protect-information"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#how-we-protect-information" className="hover:text-accent">
              8. How we protect information
            </a>
          </h2>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            We use industry-standard safeguards: encrypted connections (HTTPS),
            access controls on our internal tools, two-factor authentication on
            email and business accounts, and reputable vendors for storage. No
            system is 100% secure; we take reasonable steps but cannot guarantee
            absolute security.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="your-rights"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#your-rights" className="hover:text-accent">
              9. Your rights
            </a>
          </h2>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            Under PIPEDA, you have the right to:
          </p>
          <ul className="mb-6 ml-6 list-disc space-y-1 text-[17px] leading-[1.7] text-text-primary">
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>
              Request deletion of your information (subject to legal retention
              requirements)
            </li>
            <li>Withdraw consent for future communications</li>
            <li>
              File a complaint with the Office of the Privacy Commissioner of
              Canada (
              <a
                href="https://www.priv.gc.ca"
                className="text-accent hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                priv.gc.ca
              </a>
              )
            </li>
          </ul>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            To exercise any of these rights, email{" "}
            <a
              href="mailto:y.wang217@gmail.com"
              className="text-accent hover:underline"
            >
              y.wang217@gmail.com
            </a>
            . We&apos;ll respond within 30 days.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="childrens-privacy"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#childrens-privacy" className="hover:text-accent">
              10. Children&apos;s privacy
            </a>
          </h2>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            AP Academy provides services to minors (students in Grades 10–12),
            but we collect their information only through a parent or guardian.
            Parents are responsible for reviewing this policy before submitting
            information on behalf of their child.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="changes-to-this-policy"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#changes-to-this-policy" className="hover:text-accent">
              11. Changes to this policy
            </a>
          </h2>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            We may update this policy from time to time. The &quot;Last
            updated&quot; date at the top of the page shows when it was most
            recently revised. If we make material changes, we&apos;ll notify
            active clients by email.
          </p>

          <hr className="my-8 border-border" />

          <h2
            id="contact-us"
            className="mb-4 mt-10 text-[24px] font-bold text-navy"
          >
            <a href="#contact-us" className="hover:text-accent">
              12. Contact us
            </a>
          </h2>
          <p className="mb-4 text-[17px] leading-[1.7] text-text-primary">
            Questions about this policy, or a request to access, correct, or
            delete your information:
          </p>
          <p className="mb-2 text-[17px] leading-[1.7] text-text-primary">
            <strong>Email:</strong>{" "}
            <a
              href="mailto:y.wang217@gmail.com"
              className="text-accent hover:underline"
            >
              y.wang217@gmail.com
            </a>
          </p>
          <p className="mb-6 text-[17px] leading-[1.7] text-text-primary">
            <strong>Business:</strong> AP Academy, Ontario, Canada
          </p>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background px-4 py-8">
        <div className="mx-auto flex max-w-[720px] flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80">
              <Image
                src="/logo.png"
                alt="AP Academy"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <span className="font-semibold text-text-primary">AP Academy</span>
            </Link>
          </div>
          <div className="text-sm text-text-muted">
            <a href="mailto:y.wang217@gmail.com" className="hover:text-accent">
              y.wang217@gmail.com
            </a>
            {" · "}
            <a href="tel:+15195898217" className="hover:text-accent">
              (519) 589-8217
            </a>
            {" · "}
            <Link href="/privacy" className="hover:text-accent">
              Privacy Policy
            </Link>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-text-muted">
          © 2026 AP Academy. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
