"use client";

import { useState } from "react";
import Link from "next/link";
import { TEACHERS, SESSIONS, TRACKS, PRICING, CONTACT } from "./config";

// FAQ Data
const FAQS = [
  {
    question: "Is this program online or in person?",
    answer: `Our summer lessons are fully online and live with an instructor.

Students join from home, but the lessons are not passive video recordings. They are structured, interactive classes where students are expected to follow along, answer questions, and stay engaged.

This makes the program easier to fit into a busy summer schedule while still giving students live support and accountability.`,
  },
  {
    question: "Who is this program designed for?",
    answer: `This program is designed for Grade 11 students entering Grade 12 who are aiming for competitive university programs, especially in STEM-related fields such as engineering, computer science, health science, life science, and other high-demand programs.

It is best suited for students who are already capable, but need more structure, consistency, and a clearer study plan to reach stronger results.`,
  },
  {
    question: "Is this for students who are struggling, or students who already have strong marks?",
    answer: `Both can benefit, but the program is especially designed for students who are already doing reasonably well and want to move from "good" to "competitive."

Many students we work with are smart, but inconsistent. They may understand the material in class, but lose marks because of weak study habits, lack of structure, careless mistakes, or not knowing how to prepare for harder tests.

Our goal is to help students become more organized, more confident, and more exam-ready.`,
  },
  {
    question: "What subjects do you teach?",
    answer: `Our main summer focus is Grade 11–12 STEM preparation, especially math and physics.

Depending on the student's needs, this may include support for subjects such as Advanced Functions, Calculus and Vectors, Physics, and other related high school STEM courses.

During the call, we will ask about your child's current courses, marks, and university goals so we can recommend the best fit.`,
  },
  {
    question: "How big are the group lessons?",
    answer: `Our classes are small-group lessons, not large lectures.

The goal is to give students the benefits of a group environment while still keeping enough attention and support from the instructor. Students can learn from the teacher, see common mistakes from peers, and stay accountable throughout the program.`,
  },
  {
    question: "What happens if my child misses a class?",
    answer: `We understand that summer schedules can be busy.

If you know ahead of time that your child will miss a class, we will always help arrange a make-up option so they do not miss the instructional content.

We also know that last-minute emergencies happen. That is why we have dedicated make-up hours in the afternoon to help students catch up on missed material and stay on track.

Our goal is not to punish students for missing a class. Our goal is to make sure they still learn what they need.`,
  },
  {
    question: "What if we only find out last minute that my child cannot attend?",
    answer: `Please let us know as soon as you can.

If it is a last-minute emergency, we will do our best to help your child catch up through our make-up support hours. We cannot always guarantee the exact same time slot, but we will make sure your child has a path to recover the missed content.

We built the program with real families in mind, so we expect that occasional conflicts can happen.`,
  },
  {
    question: "Will my child fall behind if they miss one lesson?",
    answer: `No, not if they communicate with us and use the make-up support available.

The program is structured so students can stay on track, even if a conflict happens. We provide make-up support because we know one missed class should not ruin a student's progress.

The key is communication. If your child misses a lesson, we want them to catch up quickly instead of waiting until they feel lost.`,
  },
  {
    question: "What does the 95+ benchmark mean?",
    answer: `Our 95+ benchmark refers to the standard we train students toward in our own assessments and practice exams.

It does not mean we can control every school mark, teacher, test format, or university admission decision. What we can control is the quality of preparation, the level of questions students practise, and the consistency of support they receive.

Our goal is to help students become 95+ ready by building stronger understanding, better study habits, and better test performance.`,
  },
  {
    question: "Do you guarantee my child will get 95% in school?",
    answer: `No program can honestly guarantee a specific school mark because every school, teacher, and assessment is different.

What we do guarantee is that we will support students toward our 95+ benchmark through structured lessons, practice, feedback, and continued support.

If a student is attending, doing the work, and still not meeting our internal benchmark, we continue supporting them so they know what to improve and how to get closer.`,
  },
  {
    question: "What if my child is already getting 90%+?",
    answer: `That is exactly the type of student who may benefit from this program.

At competitive university levels, the difference between 90 and 95+ often comes down to consistency, speed, precision, and knowing how to handle harder questions.

Strong students do not always need more random tutoring. They need a clear system, better test preparation, and higher-level practice.`,
  },
  {
    question: "What if my child is below 80% right now?",
    answer: `We can still discuss whether the program is a fit.

However, if a student is missing major foundations, they may need extra support before they are ready for a 95+ focused group program. During the call, we will ask about your child's current level and recommend the most realistic next step.

We would rather be honest about fit than place a student into a class that is too advanced for them.`,
  },
  {
    question: "How much homework or practice will students get?",
    answer: `Students should expect practice outside of class.

The exact amount depends on the subject and the student's current level, but the goal is to build consistency. Students improve fastest when they attend class, review mistakes, and complete the assigned practice.

For many students, the biggest change is not just learning more content. It is learning how to study properly and consistently.`,
  },
  {
    question: "Will parents receive updates?",
    answer: `Yes. We know parents want to understand whether their child is actually progressing.

We will communicate important updates, concerns, and next steps when needed. If we notice that a student is missing work, falling behind, or not using the support properly, we want parents to know early instead of finding out too late.`,
  },
  {
    question: "What if my child is shy or does not like asking questions?",
    answer: `That is very common.

Small-group lessons can actually help shy students because they are not alone, but they still have more structure than watching videos by themselves.

We encourage students to participate, but we do not embarrass them or put them on the spot in a harsh way. The goal is to create a focused environment where students feel safe asking questions and improving.`,
  },
  {
    question: "Why group lessons instead of 1-on-1 tutoring?",
    answer: `1-on-1 tutoring can be helpful, but it is not always the best fit for every student.

Small-group lessons give students structure, routine, accountability, and exposure to common questions and mistakes. Students often learn a lot by seeing how other students approach the same problem.

For students aiming for competitive programs, the goal is not just to "get help with homework." The goal is to build a stronger system for learning and test preparation.`,
  },
  {
    question: "What makes AP Academy different from regular tutoring?",
    answer: `Regular tutoring often focuses only on helping students survive the next homework assignment or test.

AP Academy focuses on long-term readiness. We want students to build the marks, habits, confidence, and problem-solving ability needed for competitive Grade 12 courses and university applications.

We look at the student's current level, target program, study habits, and gaps. Then we help them build a clearer path forward.`,
  },
  {
    question: "How do I know if this is the right fit for my child?",
    answer: "LIST_ITEM", // Special marker for bulleted list
  },
  {
    question: "What happens after I fill out the form?",
    answer: `After you submit the form, we will review your answers and contact you.

During the call, we will ask about your child's current marks, subject needs, university goals, and schedule. If the program is a good fit, we will explain the next steps and how to reserve a spot.`,
  },
  {
    question: "How do we reserve a spot?",
    answer: `If your child is a good fit, you can reserve a spot with a $70 deposit.

This allows you to start with lower risk before committing to the full program. We will explain the available options during the call so you can choose what works best for your family.`,
  },
  {
    question: "What if I still have questions before signing up?",
    answer: `That is completely okay.

We expect parents to have questions, especially when they are choosing academic support for an important Grade 12 year. The call is there to help you understand the program, ask questions, and decide whether it is the right fit for your child.

We want families to feel clear before joining, not pressured.`,
  },
];

// Chevron icon for accordion
const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`h-5 w-5 flex-none text-accent transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// FAQ Accordion Item
function FAQItem({ faq, index }: { faq: typeof FAQS[0]; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `faq-panel-${index}`;
  const buttonId = `faq-button-${index}`;

  // Special handling for the "right fit" question with bulleted list
  const renderAnswer = () => {
    if (faq.answer === "LIST_ITEM") {
      return (
        <>
          <p className="mb-3">The best fit is usually a student who:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Is entering Grade 12 this September</li>
            <li>Is aiming for a competitive university program</li>
            <li>Needs stronger marks, structure, or accountability</li>
            <li>Is willing to attend online lessons consistently</li>
            <li>Wants to become more prepared before the school year becomes stressful</li>
          </ul>
          <p className="mt-3">If you are unsure, complete the form and we will speak with you before confirming whether the program is a good fit.</p>
        </>
      );
    }
    // Split by double newlines to preserve paragraph breaks
    return faq.answer.split("\n\n").map((para, i) => (
      <p key={i} className={i > 0 ? "mt-3" : ""}>
        {para}
      </p>
    ));
  };

  return (
    <div className="border-b border-border">
      <button
        id={buttonId}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <span className="text-[15px] font-semibold text-dark md:text-[16px]">{faq.question}</span>
        <ChevronIcon expanded={expanded} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={`overflow-hidden transition-all duration-200 ${expanded ? "pb-5" : "max-h-0"}`}
        style={{ display: expanded ? "block" : "none" }}
      >
        <div className="text-[14px] leading-[1.7] text-text-secondary md:text-[15px]">
          {renderAnswer()}
        </div>
      </div>
    </div>
  );
}

// SVG Icons as components
const StarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.5l1.1-6L3.4 9.3l6-.8z"/>
  </svg>
);

const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
    <path d="M12 6c-1.6-1.1-3.6-1.6-6-1.5v12c2.4-.1 4.4.4 6 1.5 1.6-1.1 3.6-1.6 6-1.5v-12c-2.4-.1-4.4.4-6 1.5z"/>
    <path d="M12 6v12"/>
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3"/>
    <path d="M3.5 19c.4-3 2.7-4.5 5.5-4.5s5.1 1.5 5.5 4.5"/>
    <path d="M16 5.5a3 3 0 0 1 0 5.6"/>
    <path d="M17.5 14.6c2 .6 3.2 2 3.5 4.4"/>
  </svg>
);

const ShieldCheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 2.5v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9v-5z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="15" rx="2"/>
    <path d="M4 9h16M8 3v4M16 3v4"/>
  </svg>
);

const CalendarCheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="15" rx="2"/>
    <path d="M8 3v4M16 3v4M8.5 13l2 2 4-4"/>
  </svg>
);

const GraduationIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-4 9 4-9 4z"/>
    <path d="M7 11v4c0 1 2.2 2 5 2s5-1 5-2v-4"/>
    <path d="M21 9v4"/>
  </svg>
);

const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="2"/>
    <path d="M8 20h8M12 16v4"/>
  </svg>
);

const CalculatorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="3" width="12" height="18" rx="2"/>
    <path d="M9 7h6"/>
    <path d="M9 11h0M12 11h0M15 11h0M9 14h0M12 14h0M15 14h0M9 17h0M12 17h0M15 17h0"/>
  </svg>
);

const FlaskIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3h4M11 3v6l-4.5 7.5A2 2 0 0 0 8.2 20h7.6a2 2 0 0 0 1.7-3.5L13 9V3"/>
    <path d="M8.5 14h7"/>
  </svg>
);

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 5.5l4 4M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/>
  </svg>
);

// Badge icon based on teacher
function TeacherBadgeIcon({ teacherId }: { teacherId: string }) {
  if (teacherId === "charlie") return <CalculatorIcon />;
  if (teacherId === "anthony") return <FlaskIcon />;
  return <PencilIcon />;
}

// Teacher Card Component
function TeacherCard({ teacher }: { teacher: typeof TEACHERS[0] }) {
  return (
    <div className="flex-1 rounded-2xl border border-border bg-surface p-6 lg:p-7">
      {/* Avatar and Name */}
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-accent-light font-serif text-[46px] text-accent-muted">
            {teacher.initial}
          </div>
          <div className="absolute -right-1.5 -bottom-0.5 flex h-[38px] w-[38px] items-center justify-center rounded-full border border-border bg-surface text-accent-muted shadow-sm">
            <span className="[&_svg]:h-[18px] [&_svg]:w-[18px]">
              <TeacherBadgeIcon teacherId={teacher.id} />
            </span>
          </div>
        </div>
        <h3 className="mt-4 whitespace-nowrap font-serif text-[30px]">{teacher.name}</h3>
        <div className="mt-3 h-0.5 w-[34px] bg-accent"></div>
      </div>

      {/* Experience */}
      <div className="mt-6 flex gap-3.5 border-b border-border pb-5">
        <div className="tile"><StarIcon /></div>
        <div className="flex-1">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.13em] text-accent-muted">Experience</p>
          <div className="bul mt-2"><span className="dot"></span><span>{teacher.experience}</span></div>
        </div>
      </div>

      {/* Specialties */}
      <div className="mt-5 flex gap-3.5 border-b border-border pb-5">
        <div className="tile"><BookIcon /></div>
        <div className="flex-1">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.13em] text-accent-muted">Specialties</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {teacher.specialties.map((s) => (
              <div key={s} className="bul"><span className="dot"></span><span>{s}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* Teaching Style */}
      <div className="mt-5 flex gap-3.5">
        <div className="tile"><UsersIcon /></div>
        <div className="flex-1">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.13em] text-accent-muted">Teaching style</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {teacher.style.map((s) => (
              <div key={s} className="bul"><span className="dot"></span><span>{s}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Track Component
function TrackCard({ track }: { track: typeof TRACKS[0] }) {
  const teacher = TEACHERS.find(t => t.id === track.teacher) ||
    (track.teacher === "charlie-ryan" ? { name: "Charlie & Ryan", initial: "C", experience: "" } : TEACHERS[0]);

  return (
    <div
      className={`rounded-2xl p-6 lg:p-7 ${
        track.recommended
          ? "border border-border-dark bg-accent-bg"
          : "border border-border bg-surface"
      }`}
    >
      {track.recommended && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-on-dark">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.5l1.1-6L3.4 9.3l6-.8z"/>
          </svg>
          Most recommended
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[1fr_1px_1fr] lg:items-center lg:gap-8">
        {/* Track Info */}
        <div>
          <h3 className="font-serif text-[27px]">{track.name}</h3>
          <div className="mt-3 flex items-center gap-2.5">
            {track.teacher === "charlie-ryan" ? (
              <span className="inline-flex">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent-light font-serif text-[15px] text-accent-muted">C</span>
                <span className="-ml-2 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-surface bg-accent-light font-serif text-[15px] text-accent-muted">R</span>
              </span>
            ) : (
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent-light font-serif text-[15px] text-accent-muted">
                {teacher.initial}
              </span>
            )}
            <span className="text-[14px] text-text-secondary">
              Led by <strong className="font-semibold">{teacher.name}</strong>
              {teacher.experience && ` · ${teacher.experience}`}
            </span>
          </div>
          <p className="mt-3 text-[14.5px] leading-relaxed text-text-muted">{track.description}</p>
        </div>

        {/* Divider */}
        <div className="hidden bg-border lg:block lg:h-full"></div>

        {/* Slots */}
        <div className="mt-4 border-t border-border pt-4 lg:mt-0 lg:border-t-0 lg:pt-0">
          {track.slots.map((slot) => (
            <div key={slot.time} className="flex items-baseline gap-2.5 py-1.5 text-[15px]">
              <span className="dot bg-accent"></span>
              <span className="min-w-[96px] font-semibold text-dark">{slot.time}</span>
              <span className="text-text-faint">— {slot.subject}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Pricing Card Component
function PriceCard({
  title,
  price,
  priceNote,
  description,
  benefit,
  icon: Icon,
  highlighted = false
}: {
  title: string;
  price: string;
  priceNote?: string;
  description: string;
  benefit: string;
  icon: React.FC;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl p-6 text-center ${
        highlighted
          ? "border border-border-dark bg-accent-bg"
          : "border border-border bg-surface"
      }`}
    >
      <h3 className="font-serif text-[22px]">{title}</h3>
      <div className="mx-auto mt-3 h-0.5 w-[30px] bg-accent"></div>
      <div className="mt-4">
        <span className="font-serif text-[52px] leading-none text-accent" dangerouslySetInnerHTML={{ __html: price }}></span>
        {priceNote && <span className="text-[14px] text-text-muted">{priceNote}</span>}
      </div>
      <p className="mx-auto mt-3.5 max-w-[24ch] text-[13.5px] leading-relaxed text-text-muted">{description}</p>
      <div className={`mt-4 flex flex-1 items-start gap-3 border-t border-dashed pt-4 text-left ${highlighted ? "border-border-dark" : "border-border-accent"}`}>
        <span className="flex-none text-accent-muted [&_svg]:h-[22px] [&_svg]:w-[22px]"><Icon /></span>
        <span className="text-[13px] leading-snug text-text-secondary">{benefit}</span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="mx-auto flex max-w-[1160px] items-center justify-between px-5 py-5 md:px-10">
        <span className="whitespace-nowrap font-serif text-[22px] tracking-tight">AP Academy</span>
        <Link
          href="/enroll"
          className="rounded-lg bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-text-on-dark transition-colors hover:bg-accent/90"
        >
          Enroll →
        </Link>
      </header>

      {/* MEET THE TEACHERS */}
      <section className="mx-auto max-w-[1160px] px-5 pb-8 pt-9 md:px-10">
        <p className="eyebrow">Meet the teachers</p>
        <h2 className="shead mt-3.5 text-[38px] md:text-[50px] lg:text-[56px]">Expert guidance. Real results.</h2>
        <p className="mx-auto mt-3.5 max-w-[60ch] text-center text-[16px] leading-relaxed text-text-muted">
          Experienced instructors who know how to build strong habits, confidence, and results.
        </p>

        <div className="mt-10 flex flex-col gap-5 lg:flex-row lg:items-stretch">
          {TEACHERS.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} />
          ))}
        </div>

        {/* Teachers footer strip */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 border-t border-border px-4 pt-4 md:gap-6">
          <div className="flex items-center gap-2.5 text-accent-muted">
            <ShieldCheckIcon />
            <span className="text-[15px] font-semibold text-dark">Vetted. Experienced. Student-focused.</span>
          </div>
          <span className="hidden h-4 w-px bg-border-accent md:block"></span>
          <Link href="/how-it-works" className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-accent-muted hover:underline">
            Learn more about our approach →
          </Link>
        </div>
      </section>

      {/* SCHEDULE - SESSIONS */}
      <section className="mx-auto max-w-[1160px] px-5 pb-5 pt-12 md:px-10">
        <p className="eyebrow">Summer course schedule</p>
        <h2 className="shead mt-3.5 text-[38px] md:text-[50px] lg:text-[56px]">Choose your 2-week session</h2>
        <p className="mx-auto mt-3.5 max-w-[60ch] text-center text-[16px] leading-relaxed text-text-muted">
          Each course includes 10 lessons. Monday to Friday. Same time each day.
        </p>

        <div className="mt-9 grid grid-cols-2 gap-3 md:grid-cols-4">
          {SESSIONS.map((session) => (
            <div key={session.id} className="rounded-xl border border-border bg-surface p-4 text-center md:p-5">
              <div className="flex justify-center text-accent-muted">
                <CalendarIcon />
              </div>
              <p className="mt-3 font-serif text-[24px]">{session.dates}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2.5 text-[15px] text-text-muted">
          <span className="text-accent"><ShieldCheckIcon /></span>
          <span>Pick one subject or combine two subjects in the same 2-week session.</span>
        </div>
      </section>

      {/* WEEKLY CLASS TIMES */}
      <section className="mx-auto max-w-[1160px] px-5 pb-8 pt-10 md:px-10">
        <h2 className="shead text-[38px]">Weekly class times</h2>
        <p className="mx-auto mt-3.5 max-w-[60ch] text-center text-[16px] leading-relaxed text-text-muted">
          Choose one class time and attend it every weekday for 2 weeks.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {TRACKS.map((track) => (
            <TrackCard key={track.id} track={track} />
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="mx-auto max-w-[1160px] px-5 pb-12 pt-12 md:px-10">
        <p className="eyebrow">Pricing</p>
        <h2 className="shead mt-3.5 text-[38px] md:text-[50px] lg:text-[56px]">Start low-risk. Upgrade when it feels right.</h2>
        <p className="mx-auto mt-3.5 max-w-[60ch] text-center text-[16px] leading-relaxed text-text-muted">
          Flexible options for families who want to try one lesson or commit to the full program.
        </p>

        <div className="mt-10 grid gap-3.5 md:grid-cols-2 lg:grid-cols-4">
          <PriceCard
            title="Start with Lesson 1"
            price={`$${PRICING.lesson1}`}
            description="Try one class first. Continue only if it feels right for your child."
            benefit="Best for families who want a low-risk start."
            icon={ShieldCheckIcon}
          />
          <PriceCard
            title="Full 2-Week Course"
            price={`$${PRICING.fullCourse}`}
            priceNote=" / subject"
            description="10 lessons · Monday–Friday · same time each day"
            benefit="Best for students who want structure and consistent practice."
            icon={CalendarCheckIcon}
          />
          <PriceCard
            title="2-Subject Bundle"
            price={`$${PRICING.bundle}`}
            description={`Take 2 subjects in the same 2-week session and save $${PRICING.bundleSavings}.`}
            benefit="Ideal for students preparing for a stronger school year."
            icon={GraduationIcon}
          />
          <PriceCard
            title="Bring a Friend Bonus"
            price="Both students<br>save $100"
            description="Applies to the full 2-week course when both students join the same class time."
            benefit="A simple way to save when friends learn together."
            icon={UsersIcon}
            highlighted
          />
        </div>

        {/* Primary CTA */}
        <div className="mt-8 text-center">
          <Link
            href="/enroll"
            className="inline-block rounded-xl bg-accent px-10 py-4 text-[16px] font-bold text-text-on-dark transition-colors hover:bg-accent/90"
          >
            Reserve your seat →
          </Link>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-4 md:flex-row md:justify-center md:gap-14">
          <div className="flex items-center gap-3 text-accent-muted">
            <BookIcon />
            <span className="text-[14px] font-semibold text-dark">10 lessons per course</span>
          </div>
          <div className="flex items-center gap-3 text-accent-muted">
            <MonitorIcon />
            <span className="text-[14px] font-semibold text-dark">Online Monday–Friday</span>
          </div>
          <div className="flex items-center gap-3 text-accent-muted">
            <ShieldCheckIcon />
            <span className="text-[14px] font-semibold text-dark">Low-risk start</span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[880px] px-5 pb-12 pt-12 md:px-10">
        <p className="eyebrow">FAQ</p>
        <h2 className="shead mt-3.5 text-[38px] md:text-[50px]">Frequently Asked Questions</h2>
        <p className="mx-auto mt-3.5 max-w-[60ch] text-center text-[16px] leading-relaxed text-text-muted">
          Everything parents usually ask before booking a call.
        </p>

        <div className="mt-10">
          {FAQS.map((faq, index) => (
            <FAQItem key={index} faq={faq} index={index} />
          ))}
        </div>

        {/* Closing CTA */}
        <div className="mt-10 text-center">
          <Link
            href="/enroll"
            className="inline-block rounded-xl bg-accent px-10 py-4 text-[16px] font-bold text-text-on-dark transition-colors hover:bg-accent/90"
          >
            Reserve the first class — $70 →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
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
              <span>·</span>
              <Link href="/privacy" className="hover:text-accent">
                Privacy Policy
              </Link>
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
