// The Path to Waterloo — the four stages a parent is walked through on the
// homepage. Charlie edits copy here; components never hard-code stage text.

export type Stage = {
  slug: "course-selection" | "grade-threshold" | "adjustment-factor" | "aif";
  index: 1 | 2 | 3 | 4;
  title: string; // "Course selection"
  beat: string; // "The call to adventure"
  hook: string; // one line, shown on hover
  body: string[]; // 2–3 paragraphs for the detail panel
  video: {
    provider: "youtube" | "vimeo" | "mux";
    id: string;
    poster: string;
    durationLabel: string; // "4 min"
  } | null;
  leadMagnetCta: string;
  illustration: "compass" | "threshold" | "storm" | "dawn"; // maps to SVG component
};

export const STAGES: Stage[] = [
  {
    slug: "course-selection",
    index: 1,
    title: "Course selection",
    beat: "The call to adventure",
    hook: "Choices made in grade 10 and 11 quietly decide which programs are still reachable.",
    body: [
      "Competitive programs like Waterloo Engineering have required courses, and the timetable that makes them possible is set in grade 10 and 11 — before most families are thinking about applications at all. Miss one prerequisite in the plan and some doors close before the application year even begins.",
      "Most families discover this in grade 12, when the schedule is already locked. The fix at that point is summer school, night school, or quietly shortening the list of programs your child can apply to.",
      "The right time to draw the course map is before grade 11 courses are chosen. It takes one conversation.",
    ],
    video: null,
    leadMagnetCta: "Get the full step-by-step breakdown",
    illustration: "compass",
  },
  {
    slug: "grade-threshold",
    index: 2,
    title: "The grade threshold",
    beat: "The first trial",
    hook: "The number is 95, not 90 — and crossing it once isn't the test. Holding it is.",
    body: [
      "Admission averages for competitive engineering programs have been climbing for years. For a program like Waterloo Engineering, being genuinely in range means holding marks in the mid-90s across the courses that count — every test, all year.",
      "A 95 isn't produced by brilliance. It's produced by consistency, and consistency comes from knowing every mistake you can make before one of them costs marks that stay on the transcript.",
      "That's what we build: the mistakes blueprint — every mistake your child can make in the course, mapped before it counts permanently. We run the entire curriculum with the student before they take the course for marks, so the school year becomes their second pass, not their first.",
    ],
    video: null,
    leadMagnetCta: "Get the full step-by-step breakdown",
    illustration: "threshold",
  },
  {
    slug: "adjustment-factor",
    index: 3,
    title: "The adjustment factor",
    beat: "The darkest hour",
    hook: "The mark on the report card is not the mark that gets read.",
    body: [
      "Waterloo has publicly acknowledged that it adjusts applicants' averages based on how students from each school have historically performed once admitted. Two students with the same report card, from two different schools, are not read as equals.",
      "Families almost never hear about this until after decisions come out. It changes what a “safe” average actually means — and how much margin a student really needs to be holding.",
      "We walk you through what's publicly documented and what we've seen with our own students, and what it means for the target your child should actually be aiming at.",
    ],
    video: null,
    leadMagnetCta: "Get the full step-by-step breakdown",
    illustration: "storm",
  },
  {
    slug: "aif",
    index: 4,
    title: "The AIF",
    beat: "The light beyond",
    hook: "The one part of the application fully in your child's control — and the one most families leave to the last week.",
    body: [
      "The Admission Information Form is Waterloo's supplementary application: activities, interests, and short written answers. It's scored, and it matters most exactly where marks alone can't separate two applicants.",
      "Unlike the adjustment factor, this piece is entirely in the student's hands. An AIF built thoughtfully over months reads very differently from one assembled the weekend before the deadline.",
      "Treat it like a course deliverable with a term-long timeline, and it becomes an advantage instead of an afterthought.",
    ],
    video: null,
    leadMagnetCta: "Get the full step-by-step breakdown",
    illustration: "dawn",
  },
];
