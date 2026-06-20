// =============================================================================
// AP Academy — Configuration
// =============================================================================
// Edit these values to update links across the site.

// Stripe Payment Links (hosted checkout — no API integration needed)
export const STRIPE_LESSON1_LINK: string = "https://buy.stripe.com/bJeeVf6UsaFy1dBe7b9bO00";
export const STRIPE_FULL_COURSE_LINK: string = "https://buy.stripe.com/dRmcN77YwdRKcWjfbf9bO01";
export const STRIPE_BUNDLE_LINK: string = ""; // TODO: Create $1100 bundle link in Stripe

// Legacy links (keeping for backward compatibility)
export const STRIPE_DEPOSIT_LINK: string = "https://buy.stripe.com/bJeeVf6UsaFy1dBe7b9bO00";
export const STRIPE_FULL_LINK: string = "https://buy.stripe.com/dRmcN77YwdRKcWjfbf9bO01";

// Video/testimonial URLs
export const VSL_EMBED_URL: string = "https://youtu.be/Q8VroTZu8qg";
export const ALEX_TESTIMONIAL_URL: string = "https://youtu.be/Q8VroTZu8qg";

// Contact info (also in CLAUDE.md — keep in sync)
export const CONTACT = {
  phone: "519-589-8217",
  email: "y.wang217@gmail.com",
  calendly: "https://calendly.com/y-wang217/30min",
};

// Pricing
export const PRICING = {
  lesson1: 70,
  fullCourse: 600,
  bundle: 1100,
  bundleSavings: 100,
  friendBonus: 100,
  sessions: 10,
  sessionLength: "1 hour",
  guaranteeScore: 95,
};

// Summer 2026 Sessions
export const SESSIONS = [
  { id: "jul-1", dates: "Jul 6–17" },
  { id: "jul-2", dates: "Jul 20–31" },
  { id: "aug-1", dates: "Aug 3–14" },
  { id: "aug-2", dates: "Aug 17–28" },
];

// Teachers
export const TEACHERS = [
  {
    id: "charlie",
    name: "Mr. Charlie",
    initial: "C",
    experience: "8+ years tutoring experience",
    icon: "calculator", // for badge
    specialties: [
      "Advanced Functions",
      "Calculus",
      "Test practice",
      "Identifying weak spots",
    ],
    style: [
      "Energetic and approachable",
      "Uses students' language",
      "Turns weak spots into focused practice",
    ],
  },
  {
    id: "anthony",
    name: "Mr. Anthony",
    initial: "A",
    experience: "10+ years tutoring experience",
    icon: "flask",
    specialties: [
      "Clear explanations",
      "Condenses information well",
      "Strong guidance",
      "Patient support",
    ],
    style: [
      "Organized and detail-focused",
      "Explains complex ideas simply",
      "Good with quiet students",
      "Patient and supportive",
    ],
  },
  {
    id: "ryan",
    name: "Mr. Ryan",
    initial: "R",
    experience: "3+ years tutoring experience",
    icon: "pencil",
    specialties: [
      "Good listener",
      "Problem solving",
      "Guided practice",
      "Encouragement",
    ],
    style: [
      "Relaxed and receptive",
      "Follows the student's pace",
      "Works through questions together",
      "Builds confidence through encouragement",
    ],
  },
];

// Class Tracks
export const TRACKS = [
  {
    id: "morning",
    name: "Senior Morning Track",
    teacher: "anthony",
    recommended: true,
    description: "Best for students who need strong guidance, clear explanations, and focused practice.",
    slots: [
      { time: "9–10 AM", subject: "Advanced Functions" },
      { time: "10–11 AM", subject: "English" },
      { time: "11 AM–12 PM", subject: "Physics" },
    ],
  },
  {
    id: "afternoon",
    name: "Afternoon Practice Track",
    teacher: "ryan",
    recommended: false,
    description: "Best for students who learn well through guided practice, encouragement, and a relaxed pace.",
    slots: [
      { time: "1–2 PM", subject: "Chemistry" },
      { time: "2–3 PM", subject: "Calculus" },
      { time: "3–4 PM", subject: "Advanced Functions" },
    ],
  },
  {
    id: "support",
    name: "Support Hours",
    teacher: "charlie-ryan",
    recommended: false,
    description: "Make-up classes or private tutoring by appointment.",
    slots: [
      { time: "5–6 PM", subject: "Make-up / Private Tutoring" },
      { time: "6–7 PM", subject: "Make-up / Private Tutoring" },
    ],
  },
];

// Subjects offered
export const SUBJECTS = [
  { name: "Advanced Functions", code: "MHF4U" },
  { name: "Calculus", code: "MCV4U" },
  { name: "Physics", code: "SPH4U" },
  { name: "Chemistry", code: "SCH4U" },
  { name: "English", code: "ENG4U" },
] as const;
