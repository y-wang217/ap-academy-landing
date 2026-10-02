import Link from "next/link";
import { CONTACT } from "@/app/config";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-5 py-8 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="font-serif text-[18px] text-dark">AP Academy</span>
          <div className="flex flex-wrap justify-center gap-3 text-[12px] text-text-muted">
            <a href={`mailto:${CONTACT.email}`} className="hover:text-accent">
              {CONTACT.email}
            </a>
            <span>·</span>
            <a href={`tel:+1${CONTACT.phone.replace(/-/g, "")}`} className="hover:text-accent">
              ({CONTACT.phone.slice(0, 3)}) {CONTACT.phone.slice(4)}
            </a>
            <span>·</span>
            <Link href="/privacy" className="hover:text-accent">
              Privacy Policy
            </Link>
          </div>
          <p className="text-[11px] text-text-faint">© {new Date().getFullYear()} AP Academy</p>
        </div>
      </div>
    </footer>
  );
}
