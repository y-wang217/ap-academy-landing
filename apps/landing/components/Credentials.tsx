import Image from "next/image";

// Two years old as a business; not as teachers. One photo, one claim, three
// facts a parent can check on a call.

const FACTS = [
  { label: "Founded", value: "2024" },
  { label: "Teaching experience", value: "10+ years" },
  { label: "Format", value: "1-on-1, live, online" },
];

export default function Credentials() {
  return (
    <section className="mx-auto max-w-[1160px] px-5 pb-14 md:px-10 md:pb-20">
      <div className="grid overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-[0.85fr_1.15fr]">
        <div className="relative min-h-[280px] md:min-h-0">
          <Image
            src="/teacher.jpeg"
            alt="Mr. Charlie, founder of AP Academy"
            fill
            sizes="(min-width: 768px) 40vw, 100vw"
            className="object-cover object-[50%_30%]"
          />
        </div>
        <div className="p-7 md:p-10 lg:p-12">
          <p className="eyebrow text-left!">Who teaches</p>
          <h2 className="mt-3 font-serif text-[30px] leading-[1.1] text-dark md:text-[38px]">
            AP Academy is two years old. Our teachers are not.
          </h2>
          <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-text-secondary">
            We opened in 2024. The people teaching here have been tutoring grade 11 and 12 math
            and science for more than ten years, in classrooms and at kitchen tables. The founder,
            Mr. Charlie, is a Waterloo Software Engineering graduate and still teaches every week.
          </p>
          <dl className="mt-7 grid gap-4 sm:grid-cols-3">
            {FACTS.map((fact) => (
              <div key={fact.label} className="border-t border-border-accent pt-3">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent-muted">{fact.label}</dt>
                <dd className="mt-1 font-serif text-[22px] leading-tight text-dark">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
