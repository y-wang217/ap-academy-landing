import Link from "next/link";

export const metadata = {
  title: "Thank You | AP Academy",
  description: "Your strategy call has been booked",
};

export default function ThankYou() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-4 py-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mb-6 text-6xl text-teal">&#10003;</div>
        <h1 className="mb-4 text-3xl font-bold text-text-primary md:text-4xl">
          Your Call Is Booked!
        </h1>
        <p className="mb-8 text-lg text-text-secondary">
          We&apos;ll see you soon. Check your email for confirmation and calendar details.
        </p>

        <div className="rounded-xl border border-border bg-navy-light p-6">
          <h2 className="mb-4 text-xl font-bold text-text-primary">
            What Happens Next?
          </h2>
          <ol className="space-y-4 text-left text-text-secondary">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                1
              </span>
              <span>
                <strong className="text-text-primary">Check your inbox</strong> — You&apos;ll receive a confirmation email with call details
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                2
              </span>
              <span>
                <strong className="text-text-primary">Prepare some notes</strong> — Think about your child&apos;s current grades and goals
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                3
              </span>
              <span>
                <strong className="text-text-primary">We&apos;ll assess & plan</strong> — Get honest feedback and a clear roadmap
              </span>
            </li>
          </ol>
        </div>

        <p className="mt-8 text-text-secondary">
          Questions?{" "}
          <a
            href="mailto:y.wang217@gmail.com"
            className="text-teal hover:text-teal-bright hover:underline"
          >
            Email us
          </a>{" "}
          or call{" "}
          <a href="tel:+15195898217" className="text-teal hover:text-teal-bright hover:underline">
            (519) 589-8217
          </a>
        </p>

        <Link
          href="/"
          className="mt-6 inline-block text-teal hover:text-teal-bright hover:underline"
        >
          &larr; Back to Home
        </Link>
      </div>
    </div>
  );
}
