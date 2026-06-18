// =============================================================================
// AP Academy — Configuration
// =============================================================================
// Edit these values to update links across the site.

// Stripe Payment Links (hosted checkout — no API integration needed)
export const STRIPE_DEPOSIT_LINK: string = "https://buy.stripe.com/bJeeVf6UsaFy1dBe7b9bO00";
export const STRIPE_FULL_LINK: string = "https://buy.stripe.com/dRmcN77YwdRKcWjfbf9bO01";

// Video Sales Letter embed URL
export const VSL_EMBED_URL: string = "https://youtu.be/Q8VroTZu8qg";

// Alex testimonial URL (99 in Calculus, Waterloo Electrical Engineering 2026)
export const ALEX_TESTIMONIAL_URL: string = "https://youtu.be/Q8VroTZu8qg";

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

// Subjects offered (no Biology)
export const SUBJECTS = [
  { name: "Advanced Functions", icon: "calculator" },
  { name: "Calculus", icon: "calculator" },
  { name: "Physics", icon: "atom" },
  { name: "Chemistry", icon: "flask-conical" },
  { name: "English", icon: "book-open" },
] as const;
