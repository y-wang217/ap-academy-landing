// =============================================================================
// AP Academy — Configuration
// =============================================================================
// Edit these values to update links across the site.

// Stripe Payment Links (hosted checkout — no API integration needed)
// Paste your Stripe Payment Link URLs here:
export const STRIPE_DEPOSIT_LINK: string = ""; // $70 deposit link — paste here
export const STRIPE_FULL_LINK: string = ""; // $600 full payment link — paste here

// Video Sales Letter embed URL
// TODO: paste YouTube/Vimeo embed URL here once recorded
export const VSL_EMBED_URL: string = "";

// Contact info (also in CLAUDE.md — keep in sync)
export const CONTACT = {
  phone: "519-589-8217",
  email: "y.wang217@gmail.com",
  calendly: "https://calendly.com/y-wang217/30min",
};

// Pricing
export const PRICING = {
  deposit: 70,
  full: 600,
  sessions: 10,
  sessionLength: "1 hour",
  guaranteeScore: 95,
};

// Subjects offered
export const SUBJECTS = [
  { name: "Math", icon: "calculator" },
  { name: "Physics", icon: "atom" },
  { name: "Chemistry", icon: "flask-conical" },
  { name: "Biology", icon: "dna" },
  { name: "English", icon: "book-open" },
] as const;
