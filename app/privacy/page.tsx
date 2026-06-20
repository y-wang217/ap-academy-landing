import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT } from "../config";

export const metadata: Metadata = {
  title: "Privacy Policy — AP Academy",
  description:
    "How AP Academy collects, uses, and protects your personal information under PIPEDA.",
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
      <header className="mx-auto flex max-w-[1160px] items-center justify-between px-5 py-5 md:px-10">
        <Link href="/" className="whitespace-nowrap font-serif text-[22px] tracking-tight text-dark">
          AP Academy
        </Link>
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-muted hover:text-accent"
        >
          ← Back
        </Link>
      </header>

      {/* Content */}
      <main className="px-5 pb-16 pt-8 md:px-10">
        <article className="mx-auto max-w-[680px]">
          <h1 className="font-serif text-[36px] leading-tight text-dark md:text-[42px]">
            Privacy Policy
          </h1>
          <p className="mt-3 text-[14px] text-text-muted">
            Last updated: «EFFECTIVE_DATE»
          </p>

          <div className="mt-10 space-y-8 text-[16px] leading-[1.75] text-text-secondary">
            <p>
              AP Academy ("AP Academy," "we," "us," or "our") is operated by «LEGAL_ENTITY_NAME» (e.g. Ambition Pathways Life Coaching Inc.), located in Ontario, Canada. This Privacy Policy explains what personal information we collect, how we use it, who we share it with, and the choices you have. We are committed to handling personal information in accordance with Canada's Personal Information Protection and Electronic Documents Act (PIPEDA) and applicable Ontario law.
            </p>
            <p>
              By using our website or enrolling in our programs, you agree to the practices described in this policy.
            </p>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">1. Who this policy is for</h2>
              <p>
                This policy applies to parents, guardians, and prospective and current students who interact with our website, advertisements, enrollment forms, or tutoring services.
              </p>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">2. Information we collect</h2>

              <p className="mb-3 font-semibold text-dark">Information you provide to us:</p>
              <ul className="mb-6 ml-5 list-disc space-y-1.5">
                <li>Contact details such as name, email address, and phone number — for example when you submit a lead/inquiry form (including forms hosted on social media platforms), book a call, or enroll.</li>
                <li>Student information relevant to tutoring, such as grade level, courses or subjects of interest, and goals.</li>
                <li>Communications you send us by email, phone, text, or messaging.</li>
                <li>Payment is processed by our third-party payment provider (Stripe). We do <strong>not</strong> collect or store your full credit/debit card numbers on our systems; Stripe handles that directly.</li>
              </ul>

              <p className="mb-3 font-semibold text-dark">Information collected automatically:</p>
              <ul className="ml-5 list-disc space-y-1.5">
                <li>Basic usage and device data (such as IP address, browser type, pages visited, and referring source) collected through standard web technologies and analytics.</li>
                <li>Cookies and similar tracking technologies, including advertising pixels (e.g. the Meta pixel) used to measure and improve our advertising. See "Cookies and tracking" below.</li>
              </ul>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">3. How we use your information</h2>
              <p className="mb-3">We use personal information to:</p>
              <ul className="ml-5 list-disc space-y-1.5">
                <li>Respond to inquiries and contact you about our programs.</li>
                <li>Schedule, deliver, and support tutoring services.</li>
                <li>Process enrollments and payments.</li>
                <li>Operate, measure, and improve our website and advertising.</li>
                <li>Send service-related and, where permitted, marketing communications (you can opt out of marketing at any time).</li>
                <li>Meet legal, accounting, and regulatory obligations.</li>
              </ul>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">4. How we share your information</h2>
              <p className="mb-3">We do not sell your personal information. We share it only with:</p>
              <ul className="ml-5 list-disc space-y-1.5">
                <li><strong>Service providers</strong> who help us operate, including: Stripe (payments), Meta/Facebook (advertising and lead forms), Google (email and related services), Zapier (workflow automation), and Notion (records management). These providers process information on our behalf and may store data on servers outside Canada, including in the United States.</li>
                <li><strong>Legal and safety</strong> recipients where required by law, or to protect our rights, users, or the public.</li>
              </ul>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">5. A note about students and minors</h2>
              <p>
                Many of our students are under the age of 18. Where we collect information about a minor, we rely on a parent or guardian to provide it or to consent to its collection and use for tutoring purposes. If you are under 18, please involve a parent or guardian before submitting information to us. If you believe a minor has provided us information without appropriate consent, contact us at «CONTACT_EMAIL» and we will address it.
              </p>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">6. Data retention</h2>
              <p>
                We keep personal information only as long as needed for the purposes described here, to provide our services, and to meet legal and accounting requirements, after which we delete or anonymize it.
              </p>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">7. Your choices and rights</h2>
              <p className="mb-3">Subject to applicable law, you may:</p>
              <ul className="mb-4 ml-5 list-disc space-y-1.5">
                <li>Request access to, or correction of, the personal information we hold about you.</li>
                <li>Withdraw consent to marketing or to certain uses of your information (this may limit our ability to provide services).</li>
                <li>Request deletion of your information, subject to legal retention requirements.</li>
              </ul>
              <p>
                To make a request, contact us at «CONTACT_EMAIL». We will respond within a reasonable time.
              </p>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">8. Cookies and tracking</h2>
              <p>
                We use cookies and similar technologies to run the site, understand usage, and measure advertising. This includes advertising pixels that let platforms like Meta show and measure ads. You can control cookies through your browser settings; disabling some may affect how the site works.
              </p>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">9. Security</h2>
              <p>
                We take reasonable administrative and technical measures to protect personal information. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.
              </p>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">10. Third-party links</h2>
              <p>
                Our site and ads may link to third-party sites and services (such as Stripe checkout). Their privacy practices are governed by their own policies, not this one.
              </p>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">11. Changes to this policy</h2>
              <p>
                We may update this policy from time to time. We will post the updated version here and revise the "Last updated" date above.
              </p>
            </section>

            <hr className="border-border" />

            <section>
              <h2 className="mb-4 font-serif text-[24px] text-dark">12. Contact us</h2>
              <p className="mb-2">
                Questions or requests about this policy or your personal information:
              </p>
              <p className="text-dark">
                «LEGAL_ENTITY_NAME»<br />
                «MAILING_ADDRESS (optional)»<br />
                Email: «CONTACT_EMAIL»
              </p>
            </section>
          </div>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background px-5 py-8 md:px-10">
        <div className="mx-auto max-w-[1160px]">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="font-serif text-[18px] text-dark">AP Academy</span>
            <div className="flex flex-wrap justify-center gap-3 text-[12px] text-text-muted">
              <a
                href={`mailto:${CONTACT.email}`}
                className="hover:text-accent"
              >
                {CONTACT.email}
              </a>
              <span>·</span>
              <a
                href={`tel:+1${CONTACT.phone.replace(/-/g, "")}`}
                className="hover:text-accent"
              >
                ({CONTACT.phone.slice(0, 3)}) {CONTACT.phone.slice(4)}
              </a>
            </div>
            <p className="text-[11px] text-text-faint">
              © {new Date().getFullYear()} AP Academy
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
