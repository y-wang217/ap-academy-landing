// FAQ copy, moved verbatim out of app/page.tsx. Order is unchanged for now;
// the objection-handling reorder is a later session.

export type FAQEntry = {
  question: string;
  /** Paragraphs shown in order. If `bullets` is set, the list renders after the first paragraph. */
  paragraphs: string[];
  bullets?: string[];
};

export const FAQS: FAQEntry[] = [
  {
    question: "Is this program online or in person?",
    paragraphs: [
      "Our summer lessons are fully online and live with an instructor.",
      "Students join from home, but the lessons are not passive video recordings. They are structured, interactive classes where students are expected to follow along, answer questions, and stay engaged.",
      "This makes the program easier to fit into a busy summer schedule while still giving students live support and accountability.",
    ],
  },
  {
    question: "Who is this program designed for?",
    paragraphs: [
      "This program is designed for Grade 11 students entering Grade 12 who are aiming for competitive university programs, especially in STEM-related fields such as engineering, computer science, health science, life science, and other high-demand programs.",
      "It is best suited for students who are already capable, but need more structure, consistency, and a clearer study plan to reach stronger results.",
    ],
  },
  {
    question: "Is this for students who are struggling, or students who already have strong marks?",
    paragraphs: [
      'Both can benefit, but the program is especially designed for students who are already doing reasonably well and want to move from "good" to "competitive."',
      "Many students we work with are smart, but inconsistent. They may understand the material in class, but lose marks because of weak study habits, lack of structure, careless mistakes, or not knowing how to prepare for harder tests.",
      "Our goal is to help students become more organized, more confident, and more exam-ready.",
    ],
  },
  {
    question: "What subjects do you teach?",
    paragraphs: [
      "Our main summer focus is Grade 11–12 STEM preparation, especially math and physics.",
      "Depending on the student's needs, this may include support for subjects such as Advanced Functions, Calculus and Vectors, Physics, and other related high school STEM courses.",
      "During the call, we will ask about your child's current courses, marks, and university goals so we can recommend the best fit.",
    ],
  },
  {
    question: "How big are the group lessons?",
    paragraphs: [
      "Our classes are small-group lessons, not large lectures.",
      "The goal is to give students the benefits of a group environment while still keeping enough attention and support from the instructor. Students can learn from the teacher, see common mistakes from peers, and stay accountable throughout the program.",
    ],
  },
  {
    question: "What happens if my child misses a class?",
    paragraphs: [
      "We understand that summer schedules can be busy.",
      "If you know ahead of time that your child will miss a class, we will always help arrange a make-up option so they do not miss the instructional content.",
      "We also know that last-minute emergencies happen. That is why we have dedicated make-up hours in the afternoon to help students catch up on missed material and stay on track.",
      "Our goal is not to punish students for missing a class. Our goal is to make sure they still learn what they need.",
    ],
  },
  {
    question: "What if we only find out last minute that my child cannot attend?",
    paragraphs: [
      "Please let us know as soon as you can.",
      "If it is a last-minute emergency, we will do our best to help your child catch up through our make-up support hours. We cannot always guarantee the exact same time slot, but we will make sure your child has a path to recover the missed content.",
      "We built the program with real families in mind, so we expect that occasional conflicts can happen.",
    ],
  },
  {
    question: "Will my child fall behind if they miss one lesson?",
    paragraphs: [
      "No, not if they communicate with us and use the make-up support available.",
      "The program is structured so students can stay on track, even if a conflict happens. We provide make-up support because we know one missed class should not ruin a student's progress.",
      "The key is communication. If your child misses a lesson, we want them to catch up quickly instead of waiting until they feel lost.",
    ],
  },
  {
    question: "What does the 95+ benchmark mean?",
    paragraphs: [
      "Our 95+ benchmark refers to the standard we train students toward in our own assessments and practice exams.",
      "It does not mean we can control every school mark, teacher, test format, or university admission decision. What we can control is the quality of preparation, the level of questions students practise, and the consistency of support they receive.",
      "Our goal is to help students become 95+ ready by building stronger understanding, better study habits, and better test performance.",
    ],
  },
  {
    question: "Do you guarantee my child will get 95% in school?",
    paragraphs: [
      "No program can honestly guarantee a specific school mark because every school, teacher, and assessment is different.",
      "What we do guarantee is that we will support students toward our 95+ benchmark through structured lessons, practice, feedback, and continued support.",
      "If a student is attending, doing the work, and still not meeting our internal benchmark, we continue supporting them so they know what to improve and how to get closer.",
    ],
  },
  {
    question: "What if my child is already getting 90%+?",
    paragraphs: [
      "That is exactly the type of student who may benefit from this program.",
      "At competitive university levels, the difference between 90 and 95+ often comes down to consistency, speed, precision, and knowing how to handle harder questions.",
      "Strong students do not always need more random tutoring. They need a clear system, better test preparation, and higher-level practice.",
    ],
  },
  {
    question: "What if my child is below 80% right now?",
    paragraphs: [
      "We can still discuss whether the program is a fit.",
      "However, if a student is missing major foundations, they may need extra support before they are ready for a 95+ focused group program. During the call, we will ask about your child's current level and recommend the most realistic next step.",
      "We would rather be honest about fit than place a student into a class that is too advanced for them.",
    ],
  },
  {
    question: "How much homework or practice will students get?",
    paragraphs: [
      "Students should expect practice outside of class.",
      "The exact amount depends on the subject and the student's current level, but the goal is to build consistency. Students improve fastest when they attend class, review mistakes, and complete the assigned practice.",
      "For many students, the biggest change is not just learning more content. It is learning how to study properly and consistently.",
    ],
  },
  {
    question: "Will parents receive updates?",
    paragraphs: [
      "Yes. We know parents want to understand whether their child is actually progressing.",
      "We will communicate important updates, concerns, and next steps when needed. If we notice that a student is missing work, falling behind, or not using the support properly, we want parents to know early instead of finding out too late.",
    ],
  },
  {
    question: "What if my child is shy or does not like asking questions?",
    paragraphs: [
      "That is very common.",
      "Small-group lessons can actually help shy students because they are not alone, but they still have more structure than watching videos by themselves.",
      "We encourage students to participate, but we do not embarrass them or put them on the spot in a harsh way. The goal is to create a focused environment where students feel safe asking questions and improving.",
    ],
  },
  {
    question: "What makes AP Academy different from regular tutoring?",
    paragraphs: [
      "Regular tutoring often focuses only on helping students survive the next homework assignment or test.",
      "AP Academy focuses on long-term readiness. We want students to build the marks, habits, confidence, and problem-solving ability needed for competitive Grade 12 courses and university applications.",
      "We look at the student's current level, target program, study habits, and gaps. Then we help them build a clearer path forward.",
    ],
  },
  {
    question: "How do I know if this is the right fit for my child?",
    paragraphs: [
      "The best fit is usually a student who:",
      "If you are unsure, complete the form and we will speak with you before confirming whether the program is a good fit.",
    ],
    bullets: [
      "Is entering Grade 12 this September",
      "Is aiming for a competitive university program",
      "Needs stronger marks, structure, or accountability",
      "Is willing to attend online lessons consistently",
      "Wants to become more prepared before the school year becomes stressful",
    ],
  },
  {
    question: "What happens after I fill out the form?",
    paragraphs: [
      "After you submit the form, we will review your answers and contact you.",
      "During the call, we will ask about your child's current marks, subject needs, university goals, and schedule. If the program is a good fit, we will explain the next steps and how to reserve a spot.",
    ],
  },
  {
    question: "How do we reserve a spot?",
    paragraphs: [
      "If your child is a good fit, you can reserve a spot with a $70 deposit.",
      "This allows you to start with lower risk before committing to the full program. We will explain the available options during the call so you can choose what works best for your family.",
    ],
  },
  {
    question: "What if I still have questions before signing up?",
    paragraphs: [
      "That is completely okay.",
      "We expect parents to have questions, especially when they are choosing academic support for an important Grade 12 year. The call is there to help you understand the program, ask questions, and decide whether it is the right fit for your child.",
      "We want families to feel clear before joining, not pressured.",
    ],
  },
];
