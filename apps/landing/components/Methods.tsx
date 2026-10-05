import { METHODS, type Method } from "@/content/methods";

// How we teach, in four cards. Copy lives in content/methods.ts.

function Icon({ name }: { name: Method["icon"] }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16M8.5 15l2 2 4-4" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M4 20l4-1 10-10-3-3L5 16z" />
          <path d="M13 8l3 3" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case "log":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
  }
}

export default function Methods() {
  return (
    <section id="methods" className="mx-auto max-w-[1160px] px-5 pb-16 pt-4 md:px-10 md:pb-24">
      <p className="eyebrow">How we teach</p>
      <h2 className="shead mt-3.5 text-[34px] md:text-[46px]">The method behind the marks</h2>
      <p className="mx-auto mt-3.5 max-w-[52ch] text-center text-[16px] leading-relaxed text-text-muted">
        Four things every lesson is built on.
      </p>
      <ol className="mt-10 grid gap-4 md:grid-cols-2">
        {METHODS.map((method, i) => (
          <li key={method.title} className="flex gap-5 rounded-2xl border border-border bg-surface p-6 md:p-7">
            <span className="tile" aria-hidden="true">
              <Icon name={method.icon} />
            </span>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-muted">0{i + 1}</p>
              <h3 className="mt-1.5 font-serif text-[23px] leading-tight text-dark">{method.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.65] text-text-secondary">{method.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
