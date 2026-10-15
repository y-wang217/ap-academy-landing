export const AI_DRAFTING_SECTION = {
  heading: "AI drafting in the Student Tracker",
  paragraphs: [
    "Our tutors keep each student's school marks and tasks in the AP Academy Student Tracker. A tutor can ask it to draft an update. When they do, the tracker sends material to Anthropic, the company that makes the Claude AI model, through Anthropic's API.",
    "What is sent: the text the tutor types or pastes, and any photos, PDFs or lesson transcripts the tutor attaches. The tracker also sends the student's current record so the draft fits it: grade level, goal (school, program and application year), courses, marks and open tasks.",
    "Why: so the AI can draft changes to marks and tasks. A draft changes nothing. The tutor checks each change and saves only the ones that are right.",
    "Names: the tracker removes the student's name and email addresses from typed text and transcripts before sending them. It does not remove names from photos or PDFs.",
    "Storage: each draft is stored in our database with the tutor's organization. We keep the proposed changes and a short quote of the material each one came from. A quote taken from a photo or PDF can contain a name. We do not keep the full text or the attached files.",
    "Anthropic handles this data under its commercial terms. Its servers may be outside Canada, including in the United States.",
  ],
  termsUrl: "https://www.anthropic.com/legal/commercial-terms",
  termsLabel: "Anthropic's commercial terms",
};

export const ANTHROPIC_PROVIDER_LINE = "Anthropic (AI drafting in the Student Tracker, see section 5)";
