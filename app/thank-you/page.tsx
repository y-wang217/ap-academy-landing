import Link from "next/link";

export const metadata = {
  title: "Thank You | AP Academy",
  description: "Download your free Waterloo Readiness Checklist",
};

export default function ThankYou() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-light px-4 py-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mb-6 text-6xl text-teal">&#10003;</div>
        <h1 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">
          You&apos;re All Set!
        </h1>
        <p className="mb-8 text-lg text-gray-600">
          Your Waterloo Readiness Checklist is ready to download. We&apos;ll
          call you within 24 hours to discuss your child&apos;s situation and
          answer any questions.
        </p>

        <a
          href="/waterloo-readiness-checklist.pdf"
          download
          className="mb-6 inline-block rounded-lg bg-teal px-8 py-4 text-lg font-bold text-white transition-all hover:bg-teal/90 hover:shadow-lg"
        >
          Download Your Checklist (PDF)
        </a>

        <div className="mt-8 rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-bold text-navy">
            What Happens Next?
          </h2>
          <ol className="space-y-3 text-left text-gray-700">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                1
              </span>
              <span>
                <strong>Review the checklist</strong> — Go through each of the
                10 steps with your child
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                2
              </span>
              <span>
                <strong>We&apos;ll call you</strong> — Expect a call within 24
                hours to discuss your results
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                3
              </span>
              <span>
                <strong>Book your trial</strong> — Schedule a $19.99 trial
                lesson to get started
              </span>
            </li>
          </ol>
        </div>

        <p className="mt-8 text-gray-500">
          Questions?{" "}
          <a
            href="mailto:contact@apacademy.ca"
            className="text-teal hover:underline"
          >
            Email us
          </a>{" "}
          or call{" "}
          <a href="tel:+14161234567" className="text-teal hover:underline">
            (416) 123-4567
          </a>
        </p>

        <Link
          href="/"
          className="mt-6 inline-block text-navy hover:underline"
        >
          &larr; Back to Home
        </Link>
      </div>
    </div>
  );
}
