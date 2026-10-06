Tracker build, step 10: the student dashboard redesign
Recorded verbatim (2026-10-06) before any step 10 work began. Four messages from the owner in one session, then the owner's answers to four questions the assistant asked; the assistant's replies between them are summarised in ADRs 0030 to 0032 and are not part of the prompt. The design mock the third message refers to is build-step-10-mock.webp.

---

for ap-academy-tracker, i want to design a dashboard that makes sense for student or parent. find the page right now and list for me the data that we're exposing. what does the data look like and what do you hypothesize as important for a student/parent to see about performance? besides the grade of top 6

---

in order to make a dashboard, i'm making a design doc and visual direction in another ai.
help me summarize the way syllabus works and how our data is formatted so it can map the design mocks properly

---

okay we have a design here:
how close can we get our dashboard to look like this?
[the mock: build-step-10-mock.webp]

---

entry date is never used for client-facing reporting, that's a business internal data point, for adherence.
we want a 'test-occurred' data point, which we need to start tracking when entering submissions.
teachers should know when a test happens, and when we create that 'test' entry, teacher will tell the system when the test is happening, and then fill in the test score later, ideally wtih a picture of the score attached.

the pill rules:

* Needs focus: 2 or more points below the course target. 2 is the same threshold the teacher's suggestions already use. (looks at overall average)
* Improving: otherwise, the grade rose about 1 point or more over the last few marks. (looks at recent performance)
* Stable: anything else.
* No grades yet: no marks.

motivational sentence should be more factual, and highlight the story of whats happening. let's draft a pool of messages that can correspond to different student performance. add that to the plan.

First, generate a plan with a prompt to write into the repo, then i'll approve and we do this as a big 'dashboard' feature branch

---

Answers to the assistant's questions:

How should we record the date a test happens? "Duedate should be for assignments and helddate should be for tests. They are mutually exclusive and should be toggled between the two when submitting"

Should the score photo attachment be part of this dashboard branch? "Defer to its own spec"

Which colours for the pills and charts? "App palette: green, neutral, amber"

Which branch should the work go on? "Stay on claude/ecstatic-clarke-j9y7dd"

---

good. commit and go on
