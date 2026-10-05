// How we teach. Four things a parent can hold us to, each one visible
// somewhere else on the page (the roster, the log, the offers).

export type Method = {
  title: string;
  body: string;
  icon: "calendar" | "pencil" | "map" | "log";
};

export const METHODS: Method[] = [
  {
    title: "Run the course before the course",
    body:
      "A grade 12 course taught front to back the summer before, so the school year is the student's second pass, not their first. Four courses in one summer is possible; one is the usual.",
    icon: "calendar",
  },
  {
    title: "Lessons are problems, not lectures",
    body:
      "Every lesson is the student doing questions with a teacher beside them. A topic is finished when the student completes the set without instruction, not when it has been explained.",
    icon: "pencil",
  },
  {
    title: "The mistakes blueprint",
    body:
      "For each course we keep a map of every mistake a student can make on it. Practice targets the ones the student has not cleared yet, before one of them costs a mark that stays on the transcript.",
    icon: "map",
  },
  {
    title: "Logged within 24 hours",
    body:
      "After every lesson the teacher logs what was covered, the latest test score, a confidence rating out of five, and where the next lesson starts. Written the same day, while it is still fresh.",
    icon: "log",
  },
];
