// Tracker end-to-end flows (build steps 4 to 10) in Chromium, against the
// local stack (stack.sh): a teacher onboards a student, publishes, the student
// signs in, marks work done, and sees a score the teacher enters. Then v1:
// a priority suggestion, a grade flag, and AI drafts against a mock model.
// Then step 10: tests with a held date, the trend charts and the story line.
// Run through ./run.sh, or directly with TRACKER_BASE set to a running tracker.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// Playwright is not a workspace dependency: use a global install.
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium } = require("playwright");

const BASE = (process.env.TRACKER_BASE ?? "http://localhost:3001/tracker").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:54321";
const MOCK_AI = process.env.MOCK_AI_URL ?? "http://127.0.0.1:54332";
const MOCK_NOTION = process.env.MOCK_NOTION_URL ?? "http://127.0.0.1:54333";

// REQ-9: the Lessons data source and the seeded lesson page. No tracker flow may name either.
const LESSONS_RE = /6300f58a|cccccccc-cccc-4ccc-8ccc-cccccccc0001/;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function signedIn(browser, email) {
  const { cookieValue } = await (await fetch(`${MOCK}/__session?email=${encodeURIComponent(email)}`)).json();
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await context.addCookies([{ name: "sb-127-auth-token", value: cookieValue, url: ORIGIN }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`  page error (${email}): ${e.message}`));
  return page;
}

function isoIn(days) {
  const d = new Date(Date.now() + days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(d);
}

const section = (page, title) => page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });

async function openDetails(scope, summary) {
  const details = scope.locator("details", { has: scope.page().getByText(summary, { exact: true }) });
  if (!(await details.evaluate((d) => d.open))) await details.locator("summary").click();
  return details;
}

async function submitAndWait(scope, button, message) {
  await scope.getByRole("button", { name: button, exact: true }).click();
  await scope.getByText(message, { exact: true }).first().waitFor({ timeout: 15000 });
}

const browser = await chromium.launch();
try {
  // Teacher: students list ---------------------------------------------------------
  const teacher = await signedIn(browser, "teacher@example.com");
  await teacher.goto(`${BASE}`);
  check("teacher home lists students", (await teacher.locator("h1").textContent()) === "Students");

  // Step 4: wizard. Create the student.
  await teacher.getByRole("link", { name: "Add a student" }).click();
  await teacher.getByLabel("First name").fill("Sam");
  await teacher.getByLabel("Last initial").fill("l");
  await teacher.getByLabel("Student email").fill("Sam@Example.com");
  await teacher.getByRole("button", { name: "Create and start setup" }).click();
  await teacher.waitForURL(/\/setup\/goal$/);
  check("creating a student opens the goal step", teacher.url().endsWith("/setup/goal"));
  const studentPath = new URL(teacher.url()).pathname.replace(/\/setup\/goal$/, "").replace(/^\/tracker/, "");

  // Validation: a bad target is refused with the field named.
  const goal = section(teacher, "Goal");
  await goal.getByLabel("School").fill("University of Waterloo");
  await goal.getByLabel("Program").fill("Software Engineering");
  await goal.getByLabel("Application year").fill("2027");
  await goal.getByLabel("Target six-course average (%)").fill("150");
  await goal.getByRole("button", { name: "Save goal" }).click();
  await goal.getByText("Check the highlighted fields.").waitFor();
  check("invalid input is refused, not saved", await goal.getByText("Target six-course average: 0 to 100").isVisible());
  check("typed values survive a failed save", (await goal.getByLabel("School").inputValue()) === "University of Waterloo");
  await goal.getByLabel("Target six-course average (%)").fill("95");
  await submitAndWait(goal, "Save goal", "Saved");
  check("goal saves", true);

  // Six courses.
  await teacher.goto(`${BASE}${studentPath}/setup/courses`);
  const courses = [["MHF4U", "Advanced Functions"], ["MCV4U", "Calculus and Vectors"], ["SPH4U", "Physics"], ["SCH4U", "Chemistry"], ["ENG4U", "English"], ["ICS4U", "Computer Science"]];
  for (const [i, [code, name]] of courses.entries()) {
    const add = section(teacher, "Add a course");
    await add.getByLabel("Code").fill(code);
    await add.getByLabel("Name").fill(name);
    await add.getByRole("button", { name: "Add course" }).click();
    await teacher.getByText(`${i + 1} of 6 courses in the six-course plan.`).waitFor({ timeout: 15000 });
  }
  check("six courses added", await teacher.getByText("6 of 6 courses in the six-course plan.").isVisible());

  // Targets: a mismatch warns but does not block.
  await teacher.goto(`${BASE}${studentPath}/setup/targets`);
  for (const [i, [code]] of courses.entries()) {
    const row = teacher.locator("li", { has: teacher.getByLabel(`${code} target (%)`) });
    await row.getByLabel(`${code} target (%)`).fill(i === 0 ? "80" : "95");
    await submitAndWait(row, "Save", "Saved");
  }
  await teacher.reload();
  check("course targets that miss the goal warn", await teacher.getByText(/Course targets average 92\.5%, which is 2\.5 points below/).isVisible());
  const first = teacher.locator("li", { has: teacher.getByLabel("MHF4U target (%)") });
  await first.getByLabel("MHF4U target (%)").fill("95");
  await submitAndWait(first, "Save", "Saved");
  await teacher.reload();
  check("matching targets read as in line", await teacher.getByText("Course targets average 95%, in line with the goal.").isVisible());

  // Syllabus: the brief's reference categories for MHF4U, one category elsewhere.
  await teacher.goto(`${BASE}${studentPath}/setup/syllabus`);
  const reference = [["Tests", "50", "mean_of_percentages"], ["Assignments", "20", "mean_of_percentages"], ["Final", "20", "mean_of_percentages"], ["Participation", "10", "mean_of_percentages"]];
  let total = 0;
  for (const [name, weight] of reference) {
    const card = section(teacher, "MHF4U syllabus");
    const add = await openDetails(card, "Add a category");
    await add.getByLabel("Category").fill(name);
    await add.getByLabel("Weight (%)").fill(weight);
    await add.getByRole("button", { name: "Add category" }).click();
    total += Number(weight);
    await card.getByText(new RegExp(`^Weights add up to ${total}%`)).waitFor({ timeout: 15000 });
  }
  for (const [code] of courses.slice(1)) {
    const card = section(teacher, `${code} syllabus`);
    const add = await openDetails(card, "Add a category");
    await add.getByLabel("Category").fill("Overall");
    await add.getByLabel("Weight (%)").fill("100");
    await add.getByRole("button", { name: "Add category" }).click();
    await card.getByText(/^Weights add up to 100%/).waitFor({ timeout: 15000 });
  }
  check("syllabus weights add up to 100 for every course", (await teacher.getByText(/^Weights add up to 100%\.$/).count()) === 6);

  // Step 5: teacher course view. Starting grades from the brief, plus upcoming work.
  await teacher.goto(`${BASE}${studentPath}/setup/work`);
  await teacher.locator("li", { hasText: "MHF4U" }).getByRole("link", { name: "Add work" }).click();
  await teacher.waitForURL(/\/courses\//);
  const coursePath = new URL(teacher.url()).pathname.replace(/^\/tracker/, "");
  const work = [
    ["Test 1", "Tests", "30", "32", isoIn(-20)],
    ["Test 2", "Tests", "41", "42", isoIn(-10)],
    ["Assignment 1", "Assignments", "10", "10", isoIn(-18)],
    ["Assignment 2", "Assignments", "9", "10", isoIn(-12)],
    ["Assignment 3", "Assignments", "10", "10", isoIn(-5)],
    ["Participation", "Participation", "3", "3", isoIn(-3)],
    ["Unit 3 test", "Tests", "", "50", isoIn(7)],
    ["Lab report", "Assignments", "", "20", isoIn(9)],
  ];
  for (const [title, category, earned, possible, due] of work) {
    const card = section(teacher, "Assessments");
    const add = await openDetails(card, "Add an assessment");
    await add.getByLabel("Title").fill(title);
    await add.getByLabel("Category").selectOption({ label: category });
    // Tests carry the day they are written; everything else a due date (ADR 0030).
    if (category === "Tests") {
      await add.locator("label", { hasText: /^Test$/ }).click();
      await add.getByLabel("Test date").fill(due);
    } else {
      await add.getByLabel("Due date").fill(due);
    }
    await add.getByLabel("Score").fill(earned);
    await add.getByLabel("Out of").fill(possible);
    await add.getByRole("button", { name: "Add", exact: true }).click();
    await card.locator("li", { hasText: title }).first().waitFor({ timeout: 15000 });
  }
  const grade = (await section(teacher, "Current grade").locator("p").first().textContent())?.trim();
  check("the brief's reference example shows 96.5%", grade === "96.5%", grade);
  check("a test shows the day it is held, an assignment its due date", await section(teacher, "Assessments").locator("li", { hasText: "Test 1" }).getByText(/Tests · Test · /).isVisible() && (await section(teacher, "Assessments").locator("li", { hasText: "Assignment 1" }).getByText(/Assignments · Due /).isVisible()));

  // Step 4 end: review and publish.
  await teacher.goto(`${BASE}${studentPath}/setup/review`);
  check("review shows ready to publish", await teacher.getByText("Ready to publish.").isVisible());
  check("review previews the student dashboard", await teacher.getByRole("heading", { name: "What Sam will see" }).isVisible());
  check("review shows the student email and who will see the grades", await teacher.getByText("The first person to sign in with this address will see this student's grades.").isVisible() && await teacher.locator("strong", { hasText: "sam@example.com" }).first().isVisible());
  await teacher.getByRole("button", { name: "Publish" }).click();
  await teacher.getByRole("heading", { name: "Published" }).waitFor({ timeout: 15000 });
  check("publishing shows the invite", await teacher.getByRole("link", { name: "Open invite email" }).isVisible());
  const mailto = await teacher.getByRole("link", { name: "Open invite email" }).getAttribute("href");
  check("the invite goes to the student's email", mailto?.startsWith("mailto:sam%40example.com"), mailto?.slice(0, 40));

  // A confirmed syllabus is read-only.
  await teacher.goto(`${BASE}${coursePath}`);
  check("syllabus is read-only after publish", await teacher.getByText(/Confirmed at publish/).isVisible());

  // A pinned priority.
  await teacher.goto(`${BASE}${studentPath}`);
  const tasks = section(teacher, "Priorities and extra practice");
  const addTask = await openDetails(tasks, "Add a priority or extra practice");
  await addTask.getByLabel("Task").fill("Redo factor theorem questions");
  await addTask.getByLabel("Course").selectOption({ label: "MHF4U" });
  await addTask.getByLabel("Why (shown to the student)").fill("Unit 3 test next week");
  await addTask.getByRole("button", { name: "Add", exact: true }).click();
  await tasks.getByText("Redo factor theorem questions").waitFor({ timeout: 15000 });
  const addExtra = await openDetails(tasks, "Add a priority or extra practice");
  await addExtra.getByLabel("Task").fill("Practice set 4");
  await addExtra.getByLabel("Type").selectOption("supplemental");
  await addExtra.getByRole("button", { name: "Add", exact: true }).click();
  await tasks.getByText("Practice set 4").waitFor({ timeout: 15000 });
  check("teacher adds a pinned priority and extra practice", true);

  // Step 6: the student ----------------------------------------------------------
  const student = await signedIn(browser, "sam@example.com");
  await student.goto(`${BASE}`);
  check("the invited student lands on their dashboard", (await student.locator("h1").textContent()) === "Hi Sam");
  const headings = await student.locator("h2").allTextContents();
  const order = ["Target", "Progress", "Subjects", "Next priorities", "Upcoming"];
  check("dashboard order: target, progress, subjects, priorities, upcoming", order.every((h, i) => headings.indexOf(h) === i), headings.join(" > "));
  check("progress names a partial average honestly", await student.getByText("Average of 1 graded course").isVisible());
  check("progress shows 96.5%", await section(student, "Progress").getByText("96.5%").isVisible());
  check("the grade note is shown", await student.getByText("Current grades are calculated based on existing marked grades.").first().isVisible());
  check("supplemental work is kept separate", await section(student, "Extra practice").getByText("Practice set 4").isVisible());
  check("no admission likelihood language", !(await student.locator("body").textContent()).match(/chance|likely|likelihood|probability|admit/i));
  check("the student has nothing to type", (await student.locator("input, textarea, select").count()) === 0);

  // Step 10: the story line, the course rows with their charts and pills (ADRs 0031, 0032).
  const progress = section(student, "Progress");
  check("the story line states the facts on screen", await progress.getByText("1 of 6 courses graded. The average so far is 1.5 above target. MCV4U, SPH4U, SCH4U, ENG4U and ICS4U have no marks yet.").isVisible());
  check("the aside names the big test coming soon", await progress.getByText(/^Unit 3 test on .+ is about 17% of MHF4U\.$/).isVisible());
  const subjects = section(student, "Subjects");
  const mhf = subjects.locator("li", { hasText: "Advanced Functions" }).first();
  check("a rising course on target reads Improving", await mhf.getByText("Improving", { exact: true }).isVisible());
  check("courses without marks read No grades yet", (await subjects.getByText("No grades yet", { exact: true }).count()) >= 5);
  check("the chart has a dot per date with a mark", (await mhf.locator("svg [role=button]").count()) === 6);
  check("the row says how much of the course is marked", await mhf.getByText("80% marked").first().isVisible());
  await mhf.locator("svg [role=button]").last().click();
  check("tapping a point lists the marks behind it", await mhf.getByText(/grade after these marks 96\.5%/).isVisible() && (await mhf.getByText("Participation · 3 / 3 · 100.0%").isVisible()));
  await student.getByText("Tap a point to see the marks behind it.").waitFor({ timeout: 15000 });
  await student.getByRole("button", { name: "Got it" }).click();
  await student.reload();
  check("the chart hint stays dismissed on this device", (await student.getByText("Tap a point to see the marks behind it.").count()) === 0);

  const upcoming = section(student, "Upcoming");
  await upcoming.getByRole("button", { name: "Mark done: Unit 3 test" }).click();
  await upcoming.getByRole("button", { name: "Done: Unit 3 test" }).waitFor();
  await student.waitForTimeout(800);
  await student.reload();
  check("Done is saved", await section(student, "Upcoming").getByRole("button", { name: "Done: Unit 3 test" }).isVisible());
  check("Done awards no marks", await student.getByText("Average of 1 graded course").isVisible() && (await section(student, "Progress").getByText("96.5%").isVisible()));

  await section(student, "Next priorities").getByRole("button", { name: "Mark done: Redo factor theorem questions" }).click();
  await section(student, "Next priorities").getByRole("button", { name: "Done: Redo factor theorem questions" }).waitFor();
  check("priorities can be marked done", true);

  // Drill-down.
  await section(student, "Subjects").getByRole("link", { name: /MHF4U/ }).click();
  await student.waitForURL(/\/courses\//);
  check("drill-down shows categories", await section(student, "Categories").getByText("Final").isVisible() && (await section(student, "Categories").getByText("None yet").isVisible()));
  check("drill-down shows past scores", await section(student, "Past scores").getByText("41 / 42").isVisible());

  // Teacher enters a score on the same record the student marked done.
  await teacher.goto(`${BASE}${coursePath}`);
  const row = section(teacher, "Assessments").locator("li", { hasText: "Unit 3 test" });
  check("teacher sees the student marked it done", await row.getByText(/Student marked done/).isVisible());
  await row.getByLabel("Score").fill("0");
  await submitAndWait(row, "Save score", "Saved");
  await student.goto(`${BASE}`);
  check("a real zero lowers the grade", !(await section(student, "Progress").getByText("96.5%").isVisible()));
  check("graded work leaves Upcoming", !(await section(student, "Upcoming").getByText("Unit 3 test").isVisible()));
  await row.getByLabel("Score").fill("");
  await submitAndWait(row, "Save score", "Saved");
  await student.reload();
  check("clearing the score (unmarked) restores the grade", await section(student, "Progress").getByText("96.5%").isVisible());

  // Step 8: a priority suggestion (ADR 0024) ------------------------------------------
  // MHF4U is 96.5%; a 99% target puts it 2.5 points behind with nothing due soon
  // (Unit 3 test is marked done, the lab is 9 days out), so the rule says review.
  await teacher.goto(`${BASE}${coursePath}`);
  const target = section(teacher, "Current grade");
  await target.getByLabel("Course target (%)").fill("99");
  await submitAndWait(target, "Save target", "Saved");
  await teacher.goto(`${BASE}${studentPath}`);
  const priorities = section(teacher, "Priorities and extra practice");
  const reason = "MHF4U is 2.5% below target. Tests is the lowest category at 95.7%.";
  check("the teacher sees a suggestion with its reason", await priorities.getByText(reason).isVisible());
  await priorities.locator("li", { hasText: "Review Tests in MHF4U" }).getByRole("button", { name: "Add to priorities" }).click();
  await priorities.getByText("Suggested", { exact: true }).waitFor({ state: "detached", timeout: 15000 });
  check("adding a suggestion makes it a task and hides it", await priorities.getByText("Review Tests in MHF4U").count() === 1);
  await student.goto(`${BASE}`);
  check("the student sees the added priority with its reason", await section(student, "Next priorities").getByText(new RegExp(`MHF4U · ${reason.replace(/[.%]/g, "\\$&")}`)).isVisible());

  // Step 8: a grade flag (ADR 0025) ----------------------------------------------------
  await section(student, "Subjects").getByRole("link", { name: /MHF4U/ }).click();
  await student.waitForURL(/\/courses\//);
  const past = section(student, "Past scores");
  await past.getByRole("button", { name: "Flag Test 1" }).click();
  await past.getByRole("button", { name: "My mark is different" }).click();
  await past.getByText("Flagged: My mark is different. Your tutor will check.").waitFor({ timeout: 15000 });
  await student.reload();
  check("a student flags a grade and the flag is saved", await section(student, "Past scores").getByText("Flagged: My mark is different.", { exact: false }).isVisible());
  check("flagging needs no typing", (await student.locator("input, textarea, select").count()) === 0);
  await teacher.goto(`${BASE}`);
  check("the teacher's student list counts the flag", await teacher.getByText("1 flag", { exact: true }).isVisible());
  await teacher.goto(`${BASE}${coursePath}`);
  check("the course view shows the flag on the assessment", await section(teacher, "Assessments").locator("li", { hasText: "Test 1" }).getByText(/Student flagged this: .My mark is different./).isVisible());
  await teacher.goto(`${BASE}${studentPath}`);
  const flags = section(teacher, "Flags from Sam");
  check("the student page lists the flag", await flags.getByText("MHF4U · Test 1").isVisible());
  await flags.getByRole("button", { name: "Mark resolved" }).click();
  await flags.waitFor({ state: "detached", timeout: 15000 });
  check("resolving clears the flag for the teacher", true);
  await student.reload();
  check("resolving clears the flag for the student", await section(student, "Past scores").getByRole("button", { name: "Flag Test 1" }).isVisible());
  check("a flag never changes the grade", await section(student, "Current grade").getByText("96.5%").isVisible());

  // A failed save rolls back and says so: archive the student, then tap Done.
  await teacher.goto(`${BASE}${studentPath}`);
  teacher.once("dialog", (d) => d.accept());
  await teacher.getByRole("button", { name: "Archive student" }).click();
  await teacher.getByText(/^Archived\./).waitFor({ timeout: 15000 });
  const lab = section(student, "Upcoming").getByRole("button", { name: "Mark done: Lab report" });
  await lab.click();
  await section(student, "Upcoming").getByRole("alert").waitFor({ timeout: 15000 });
  check("a failed Done shows an error", (await section(student, "Upcoming").getByRole("alert").textContent())?.includes("no longer available"));
  check("a failed Done rolls back", await section(student, "Upcoming").getByRole("button", { name: "Mark done: Lab report" }).isVisible());

  // Someone signed in without an invite sees nothing.
  const outsider = await signedIn(browser, "nobody@example.com");
  await outsider.goto(`${BASE}`);
  check("an uninvited user sees nothing", (await outsider.locator("h1").textContent()) === "Nothing here yet");
  const direct = await outsider.goto(`${BASE}${studentPath}`);
  check("an uninvited user cannot open a student page", direct?.status() === 404);
  // Step 8 and 9: AI draft, preview, confirm, save (ADRs 0026, 0028, 0029), against the mock model ---------
  await teacher.goto(`${BASE}${coursePath}`);
  const composer = section(teacher, "Update from notes or a request");
  await composer.getByRole("textbox").fill("Sam L. (sam@example.com)\nLab report 18/20\nQuiz 2 9/10\nmaybe review unit 3\nField trip money due Friday");
  await composer.getByRole("button", { name: "Draft changes" }).click();
  await composer.getByText("Nothing has been saved yet.", { exact: false }).waitFor({ timeout: 30000 });
  const sent = await (await fetch(`${MOCK_AI}/__last`)).json();
  const sentText = JSON.stringify(sent);
  check("the AI request carries no student name or email", !/Sam|sam@example\.com/.test(sentText) && sentText.includes("the student"));
  check("the AI request uses refs, not row ids", !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(sentText));
  check("the AI request names the course the teacher is looking at", /looking at course C\d/.test(sentText));
  // The preview rows render a beat after the notice (a main run failed only "an uncertain change starts
  // unticked and says so"), so wait for them before reading anything.
  await composer.getByText("Unmarked, out of 20 → 18 / 20").waitFor({ timeout: 15000 });
  await composer.getByText("Check this one").waitFor({ timeout: 15000 });
  await composer.getByRole("button", { name: "Save selected (2)" }).waitFor({ timeout: 15000 });
  check("the preview shows a score change against the current value", await composer.getByText("Unmarked, out of 20 → 18 / 20").isVisible());
  check("the preview shows new work", await composer.getByText("Quiz 2", { exact: true }).isVisible() && (await composer.getByText(/^New · MHF4U · Assignments/).isVisible()));
  check("an uncertain change starts unticked and says so", await composer.getByText("Check this one").isVisible() && (await composer.getByRole("button", { name: "Save selected (2)" }).isVisible()));
  check("lines the AI could not place are listed, not saved", await composer.getByText("Field trip money due Friday").isVisible());
  const before = await section(teacher, "Assessments").locator("li", { hasText: "Quiz 2" }).count();
  check("nothing is saved before confirm", before === 0);
  await composer.getByRole("button", { name: "Save selected (2)" }).click();
  await composer.getByText("Saved 2 changes").waitFor({ timeout: 15000 });
  await teacher.reload();
  const assessments = section(teacher, "Assessments");
  check("confirmed changes are saved", (await assessments.locator("li", { hasText: "Quiz 2" }).count()) === 1 && (await assessments.locator("li", { hasText: "Lab report" }).getByText("90.0%").isVisible()));
  await teacher.goto(`${BASE}${studentPath}`);
  check("the unticked change was not saved", (await teacher.getByText("Review unit 3 before the test").count()) === 0);
  const history = section(teacher, "AI drafts");
  check("the draft is on record for the student", await history.getByText("Saved", { exact: true }).first().isVisible() && (await history.getByText(/3 changes drafted, 1 not placed/).isVisible()));
  check("the student number is shown to the teacher", await teacher.getByText(/S-\d{4}/).isVisible());
  // The composer on the student page drafts for the whole student: a request in words.
  const whole = section(teacher, "Update from notes or a request");
  await whole.getByRole("textbox").fill("Lab report 18/20");
  await whole.getByRole("button", { name: "Draft changes" }).click();
  await whole.getByText("Nothing has been saved yet.", { exact: false }).waitFor({ timeout: 30000 });
  check("a change that changes nothing is left out of the draft", (await whole.getByText("Lab report", { exact: true }).count()) === 0);
  await whole.getByRole("button", { name: "Discard" }).click();
  await whole.getByRole("button", { name: "Draft changes" }).waitFor({ timeout: 15000 });

  // Scheduler availability (REQ-5) ---------------------------------------------------
  const ryan = await signedIn(browser, "ryan@example.com");
  await ryan.goto(`${BASE}`);
  await ryan.getByRole("link", { name: "Set your availability" }).click();
  await ryan.waitForURL(/\/schedule\/availability$/);
  check("a scheduler teacher gets a link and lands on their own availability", (await ryan.getByRole("combobox", { name: "Teacher" }).count()) === 0 && (await ryan.locator("h1").textContent()) === "Your availability");
  const dayOf = (page, name) => page.locator("li", { has: page.getByRole("heading", { name, exact: true }) });
  const monday = dayOf(ryan, "Monday");
  await monday.getByRole("button", { name: /Add hours/ }).click();
  await monday.getByRole("button", { name: "Save Monday new window" }).click();
  await monday.getByLabel("Monday new window start").waitFor({ state: "detached", timeout: 15000 });
  await monday.getByRole("button", { name: /Add hours/ }).click();
  await monday.getByLabel("Monday new window start").fill("13:00");
  await monday.getByLabel("Monday new window end").fill("17:00");
  await monday.getByRole("button", { name: "Save Monday new window" }).click();
  await monday.getByLabel("Monday new window start").waitFor({ state: "detached", timeout: 15000 });
  await monday.getByRole("button", { name: /Copy to/ }).click();
  await monday.getByLabel("Wednesday", { exact: true }).check();
  await monday.getByLabel("Friday", { exact: true }).check();
  await monday.getByRole("button", { name: "Copy", exact: true }).click();
  await ryan.getByText("Copied", { exact: true }).waitFor({ timeout: 15000 });
  const offDate = isoIn(5);
  await ryan.getByLabel("Date").fill(offDate);
  await ryan.getByRole("button", { name: "Add", exact: true }).click();
  await ryan.getByText("(all day)", { exact: false }).first().waitFor({ timeout: 15000 });
  await ryan.reload();
  await ryan.getByRole("heading", { name: "Weekly hours" }).waitFor();
  const hours = async (name) => dayOf(ryan, name).locator("input[type=time]").evaluateAll((els) => els.map((e) => e.value));
  check("two Monday windows saved and copied to Wednesday and Friday, after a reload",
    JSON.stringify(await hours("Monday")) === JSON.stringify(["09:00", "12:00", "13:00", "17:00"])
    && JSON.stringify(await hours("Wednesday")) === JSON.stringify(["09:00", "12:00", "13:00", "17:00"])
    && JSON.stringify(await hours("Friday")) === JSON.stringify(["09:00", "12:00", "13:00", "17:00"]));
  const preview = section(ryan, "Next 14 days");
  check("the day off shows as Time off in the 14-day preview", (await preview.locator("li", { hasText: "Time off" }).count()) >= 1);
  check("preview states carry text, not colour alone", (await preview.getByText("Unavailable").count()) >= 1 && (await preview.getByText(/Available 09:00-12:00, 13:00-17:00/).count()) >= 1);
  check("no horizontal scroll at 375px", await ryan.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  // Keyboard only: add, save and remove a Sunday window.
  const sunday = dayOf(ryan, "Sunday");
  await sunday.getByRole("button", { name: /Add hours/ }).focus();
  await ryan.keyboard.press("Enter");
  await sunday.getByRole("button", { name: "Save Sunday new window" }).focus();
  await ryan.keyboard.press("Space");
  await sunday.getByLabel("Sunday new window start").waitFor({ state: "detached", timeout: 15000 });
  await sunday.getByRole("button", { name: "Remove Sunday window 1" }).focus();
  await ryan.keyboard.press("Enter");
  await ryan.waitForFunction(() => document.querySelectorAll("li input[type=time]").length === 12);
  check("a window can be added, saved and removed with the keyboard", (await hours("Sunday")).length === 0);

  // Removing the window under the seeded Monday 10:00 class flags it, and moves nothing.
  await monday.getByRole("button", { name: "Remove Monday window 1" }).click();
  await ryan.waitForFunction(() => document.querySelectorAll("li input[type=time]").length === 10);
  await ryan.reload();
  const outsideNotice = ryan.getByText(/of your classes (is|are) outside your hours/);
  await outsideNotice.waitFor({ timeout: 15000 }).catch(() => {});
  check("the teacher is told about classes outside their hours", await outsideNotice.isVisible());
  await teacher.goto(`${BASE}`);
  const badge = teacher.getByRole("link", { name: /Teacher availability/ });
  check("the owner's home shows the conflict badge", /outside availability/.test(await badge.textContent()));
  await teacher.goto(`${BASE}/schedule/conflicts`);
  check("the conflicts page lists the class with teacher, time and reason", (await teacher.getByText("Ryan Test", { exact: false }).count()) >= 1 && await teacher.getByText("10:00-11:00", { exact: false }).first().isVisible() && await teacher.getByText("Outside available hours").first().isVisible());

  // Weekly calendar (REQ-6) ----------------------------------------------------------
  // The seeded classes start on a Monday 7 to 13 days from now; open the week that holds them.
  const classDay = [7, 8, 9, 10, 11, 12, 13].map(isoIn).find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1);
  const KUBY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
  await ryan.goto(`${BASE}`);
  await ryan.getByRole("link", { name: "Your week" }).click();
  await ryan.waitForURL(/\/schedule$/);
  check("a teacher's week has no teacher selector and no All teachers link", (await ryan.getByRole("combobox", { name: "Teacher" }).count()) === 0 && (await ryan.getByRole("link", { name: "All teachers" }).count()) === 0);
  await ryan.goto(`${BASE}/schedule?date=${classDay}`);
  const card = ryan.getByRole("button", { name: /Sam Student/ });
  await card.waitFor({ timeout: 15000 });
  check("the teacher's class shows student, subject and time", (await card.textContent()).includes("MHF4U") && (await card.textContent()).includes("10:00-11:00"));
  check("a teacher sees no other teacher's student", (await ryan.getByText("Kim Kuby-Student").count()) === 0);
  check("the class outside their hours is labelled in words", await ryan.getByText("Outside hours").first().isVisible());
  check("Previous and Next week links keep the week moving", (await ryan.getByRole("link", { name: /Next week/ }).getAttribute("href")).includes("date="));
  check("no horizontal scroll on the week at 375px", await ryan.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await card.click();
  const dialog = ryan.getByRole("dialog");
  const studentHref = "https://www.notion.so/" + "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001".replaceAll("-", "");
  check("clicking a class opens its details with a student record link", (await dialog.isVisible()) && (await dialog.getByRole("link", { name: "Open student record" }).getAttribute("href")) === studentHref);
  await ryan.keyboard.press("Escape");
  check("Escape closes the dialog and focus returns to the card", !(await dialog.isVisible()) && (await ryan.evaluate(() => document.activeElement?.textContent ?? "")).includes("Sam Student"));
  await ryan.goto(`${BASE}/schedule?staffId=${KUBY}`);
  check("a teacher asking for another teacher's week is refused", await ryan.getByText("This page is not available for your account.").isVisible());
  await ryan.goto(`${BASE}/schedule?view=all`);
  check("a teacher asking for All teachers is refused", await ryan.getByText("This page is not available for your account.").isVisible() && (await ryan.getByText("Kim Kuby-Student").count()) === 0);
  const weekApi = await ryan.evaluate(async (base) => (await fetch(`${base}/api/scheduler/week?staffId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002`)).status, BASE);
  check("the week endpoint refuses a teacher asking for another teacher", weekApi === 403);

  await teacher.goto(`${BASE}`);
  await teacher.getByRole("link", { name: "Teacher schedules" }).click();
  await teacher.waitForURL(/view=all/);
  await teacher.goto(`${BASE}/schedule?view=all&date=${classDay}`);
  await teacher.getByRole("heading", { name: "Ryan Test" }).waitFor({ timeout: 15000 });
  check("the owner's All teachers view lists both teachers with their students and hours",
    await teacher.getByRole("heading", { name: "Kuby Test" }).isVisible() && await teacher.getByText("Sam Student").isVisible() && await teacher.getByText("Kim Kuby-Student").isVisible()
    && (await teacher.getByText(/Scheduled 1 h/).count()) >= 2);
  check("a student with no class in the week never appears", (await teacher.getByText("Nobody Booked").count()) === 0);

  // REQ-9: snapshot every tracker table the scheduler may not touch, after sign-in and before the first booking step.
  const SCHEDULER_TABLES = ["class_series", "class_exceptions", "schedule_summaries", "audit_log", "daily_tasks", "daily_task_teachers", "booking_stamps", "schedule_writes"];
  const psql = (sql) => execSync(`psql -X -A -t "${process.env.PG_URL}" -c "${sql}"`).toString().trim();
  const otherTables = () =>
    psql("select table_name from information_schema.tables where table_schema = 'tracker' and table_type = 'BASE TABLE' order by 1")
      .split("\n").filter((t) => t && !SCHEDULER_TABLES.includes(t));
  const snapshot = () => Object.fromEntries(otherTables().map((t) => [t, psql(`select count(*) || ' ' || coalesce(md5(string_agg(x::text, '' order by x::text)), '') from tracker.${t} x`)]));
  const tablesBefore = process.env.PG_URL ? snapshot() : null;
  const lessonUrl = `${MOCK_NOTION}/v1/pages/cccccccc-cccc-4ccc-8ccc-cccccccc0001`;
  const lessonBefore = await (await fetch(lessonUrl, { headers: { "x-e2e-probe": "1" } })).text();

  // Booking and drag-to-move (REQ-7) ---------------------------------------------------
  // Ryan's Wednesday hours (copied from Monday above) hold 10:00, so Monday 10:00 can move there.
  const RYAN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const heading = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const plus = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const wed = plus(classDay, 2);
  await teacher.setViewportSize({ width: 1200, height: 900 });
  await teacher.goto(`${BASE}/schedule?staffId=${RYAN_ID}&date=${classDay}`);
  const samCard = teacher.getByRole("button", { name: /Sam Student/ });
  await samCard.waitFor({ timeout: 15000 });
  const monBox = await samCard.boundingBox();
  await teacher.mouse.move(monBox.x + monBox.width / 2, monBox.y + 8);
  await teacher.mouse.down();
  await teacher.mouse.move(monBox.x + monBox.width / 2 + monBox.width * 1.2, monBox.y + 8, { steps: 8 });
  await teacher.mouse.move(monBox.x + monBox.width / 2 + monBox.width * 2, monBox.y + 8, { steps: 8 });
  check("dragging shows a ghost with the day and time in words", await teacher.getByText(`${heading(wed)} 10:00-11:00`, { exact: true }).isVisible());
  await teacher.mouse.up();
  const ask = teacher.getByRole("dialog", { name: "Move this class?" });
  await ask.waitFor({ timeout: 5000 });
  check("a weekly class asks for the scope, with This class only preselected", await ask.getByLabel("This class only").isChecked());
  await ask.getByRole("button", { name: "Move" }).click();
  await teacher.getByText("Saving…").first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await teacher.reload();
  const moved = teacher.getByRole("button", { name: /Sam Student/ });
  await moved.waitFor({ timeout: 15000 });
  await moved.click();
  const details = teacher.getByRole("dialog").filter({ hasText: "Sam Student" });
  check("after a reload the class is on Wednesday at the same time and length, marked moved",
    (await details.textContent()).includes(heading(wed)) && (await details.textContent()).includes("10:00-11:00") && (await details.textContent()).includes("60 min") && /Moved/.test(await details.textContent()));
  await teacher.keyboard.press("Escape");

  // A refused save puts the card back and says why.
  const atWed = await moved.boundingBox();
  await teacher.route("**/api/scheduler/classes/**", (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue()));
  await teacher.mouse.move(atWed.x + atWed.width / 2, atWed.y + 8);
  await teacher.mouse.down();
  await teacher.mouse.move(atWed.x + atWed.width / 2 + atWed.width, atWed.y + 8, { steps: 10 });
  await teacher.mouse.up();
  await teacher.getByText(/^Not saved/).waitFor({ timeout: 15000 });
  const afterFail = await teacher.getByRole("button", { name: /Sam Student/ }).boundingBox();
  // The error notice sits above the grid and pushes it down, so compare the column (x), then confirm the day in the details.
  check("a failed save returns the card to its slot and shows an error", Math.abs(afterFail.x - atWed.x) < 2);
  await teacher.unroute("**/api/scheduler/classes/**");

  // Book a class on a phone, with the keyboard.
  await teacher.setViewportSize({ width: 375, height: 800 });
  await teacher.reload();
  await teacher.getByRole("button", { name: "Book a class" }).focus();
  await teacher.keyboard.press("Enter");
  const form = teacher.getByRole("dialog", { name: "Book a class" });
  await form.waitFor({ timeout: 5000 });
  await form.getByLabel("Student").focus();
  await teacher.keyboard.type("Nobody");
  await form.getByLabel("Subject").fill("MPM2D");
  await form.getByLabel("Date").fill(wed);
  await form.getByLabel("Start time").fill("13:00");
  check("the booking form fits a 375px screen", await teacher.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await form.getByLabel("Duration in minutes").focus();
  await teacher.keyboard.press("Enter");
  const booked = await form.waitFor({ state: "detached", timeout: 15000 }).then(() => true, () => false);
  check("the booking form closes after a keyboard submit", booked, booked ? "" : await form.getByRole("alert").textContent().catch(() => "no alert"));
  // The desktop grid is in the DOM but hidden at 375px, so look only at what is visible.
  // Wait for the class card, not the text: the save notice also names the student (REQ-28).
  await teacher.getByRole("button", { name: /Nobody Booked/ }).locator("visible=true").first().waitFor({ timeout: 15000 });
  check("a booked class appears in the week after saving", await teacher.getByText("MPM2D").locator("visible=true").first().isVisible());

  // A clash is refused with the slot in the message and nothing is booked.
  await teacher.getByRole("button", { name: "Book a class" }).click();
  const clash = teacher.getByRole("dialog", { name: "Book a class" });
  await clash.getByLabel("Student").selectOption({ label: "Sam Student" });
  await clash.getByLabel("Subject").fill("MHF4U");
  await clash.getByLabel("Date").fill(wed);
  await clash.getByLabel("Start time").fill("13:30");
  await clash.getByRole("button", { name: "Book class" }).click();
  await clash.getByRole("alert").waitFor({ timeout: 15000 });
  check("a double-booked teacher is refused with a plain message", /already has a class/.test(await clash.getByRole("alert").textContent()));
  await teacher.keyboard.press("Escape");

  // Teachers cannot book or move: no controls, and the server says 403.
  await ryan.setViewportSize({ width: 1200, height: 900 });
  await ryan.goto(`${BASE}/schedule?date=${classDay}`);
  await ryan.getByRole("button", { name: /Sam Student/ }).first().waitFor({ timeout: 15000 });
  check("a teacher's week has no Book a class button and its cards are not draggable",
    (await ryan.getByRole("button", { name: "Book a class" }).count()) === 0 && (await ryan.getByRole("button", { name: /Sam Student/ }).first().evaluate((el) => !el.className.includes("cursor-grab"))));
  const teacherPatch = await ryan.evaluate(async ({ base, from, to }) => {
    // Monday's class was dragged to Wednesday above, so look at the whole week and use the occurrence's own original date.
    const list = await (await fetch(`${base}/api/scheduler/classes/occurrences?from=${from}&to=${to}`)).json();
    const { seriesId: id, originalDate } = list.occurrences.find((o) => o.originalDate === from);
    const res = await fetch(`${base}/api/scheduler/classes/${id}/occurrences/${originalDate}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID(), expectedUpdatedAt: "2026-01-01T00:00:00.000Z", scope: "this", changes: { startTime: "11:00" } }),
    });
    return res.status;
  }, { base: BASE, from: classDay, to: plus(classDay, 6) });
  check("a teacher's PATCH on a class is refused with 403", teacherPatch === 403);

  // REQ-8: the daily "Text teachers their schedules" task. Create now makes one page in the mock's Work database
  // with both seeded teachers, a second press adds nothing, and the run endpoint is reachable signed out but guarded.
  const workPages = async () => (await (await fetch(`${MOCK_NOTION}/__work`)).json()).pages.filter((p) => p.ds === "3031b455-9be0-4f8d-b200-70fcfcf1a0b8");
  await teacher.goto(`${BASE}/schedule`);
  await teacher.getByRole("button", { name: "Create now" }).click();
  await teacher.getByText("Today's Notion task is ready.").waitFor({ timeout: 15000 });
  const made = await workPages();
  check("Create now makes one Work page with a to-do per teacher",
    made.length === 1 && made[0].todos.map((t) => t.text.split(":")[0]).join(",") === "Kuby Test,Ryan Test" && made[0].todos.every((t) => !t.checked));
  await teacher.getByRole("button", { name: "Refresh now" }).click();
  await teacher.getByText("Today's Notion task is ready.").waitFor({ timeout: 15000 });
  check("a second press adds no page", (await workPages()).length === 1);

  // REQ-16: a cross-origin write to a scheduler route is refused before the session is read.
  const dailyTask = `${BASE}/api/scheduler/daily-task`;
  const evil = await teacher.context().request.post(dailyTask, { data: { date: isoIn(0) }, headers: { Origin: "https://evil.example" } });
  check("a signed-in POST with a foreign Origin is refused with 403 forbidden",
    evil.status() === 403 && JSON.stringify(await evil.json()) === '{"error":"forbidden"}');
  const plain = await teacher.context().request.post(dailyTask, { data: { date: isoIn(0) } });
  check("the same POST without that header still succeeds", plain.status() === 200);
  check("the refused request changed nothing", (await workPages()).length === 1);

  const runUrl = `${BASE}/api/scheduler/daily-task/run`;
  const noBearer = await fetch(runUrl, { method: "POST", redirect: "manual" });
  const wrongBearer = await fetch(runUrl, { method: "POST", redirect: "manual", headers: { Authorization: "Bearer wrong" } });
  check("the run endpoint answers 401, not a login redirect, without the secret", noBearer.status === 401 && wrongBearer.status === 401);
  const signedOutPage = await fetch(`${BASE}/schedule`, { redirect: "manual" });
  check("every other tracker path still redirects to /login when signed out",
    signedOutPage.status >= 300 && signedOutPage.status < 400 && (signedOutPage.headers.get("location") ?? "").includes("/login"));
  const signedOutApi = await fetch(`${BASE}/api/scheduler/daily-task`, { method: "POST", redirect: "manual" });
  check("the admin daily-task endpoint is not exempt", signedOutApi.status >= 300 && signedOutApi.status < 400);

  // REQ-9: edit (this and future) and cancel (this, then this and future) as the admin, on Kuby's weekly class.
  const adminCall = (method, path, body) => teacher.evaluate(async ({ base, method, path, body }) => {
    const res = await fetch(`${base}/api/scheduler/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), ...body }) });
    return res.status === 200 || res.status === 201 ? res.status : `${res.status} ${(await res.text()).slice(0, 160)}`;
  }, { base: BASE, method, path, body });
  const kubyOccurrence = (date) => teacher.evaluate(async ({ base, date }) => {
    const list = await (await fetch(`${base}/api/scheduler/classes/occurrences?from=${date}&to=${date}`)).json();
    const o = list.occurrences.find((x) => x.studentId === "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002" && x.originalDate === date);
    return o ? { seriesId: o.seriesId, stamp: o.seriesUpdatedAt } : null;
  }, { base: BASE, date });
  const edited = await kubyOccurrence(plus(classDay, 14));
  const editStatus = edited && await adminCall("PATCH", `classes/${edited.seriesId}/occurrences/${plus(classDay, 14)}`, { expectedUpdatedAt: edited.stamp, scope: "future", changes: { subject: "MPM2D" } });
  const cancelledOne = await kubyOccurrence(plus(classDay, 7));
  const cancelOne = cancelledOne && await adminCall("DELETE", `classes/${cancelledOne.seriesId}/occurrences/${plus(classDay, 7)}`, { expectedUpdatedAt: cancelledOne.stamp, scope: "this" });
  const cancelledRest = await kubyOccurrence(plus(classDay, 21));
  const cancelRest = cancelledRest && await adminCall("DELETE", `classes/${cancelledRest.seriesId}/occurrences/${plus(classDay, 21)}`, { expectedUpdatedAt: cancelledRest.stamp, scope: "future" });
  // A weekly class for the student the booking flow already adopted, so a Weekly Schedule write really happens.
  const weekly = await adminCall("POST", "classes", { staffId: RYAN_ID, studentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003", subject: "MPM2D", kind: "weekly", startDate: plus(classDay, 9), startTime: "15:00", durationMinutes: 60, effectiveUntil: null });
  check("the admin's edit (future), cancel (this), cancel (future) and a weekly booking all saved",
    editStatus === 200 && cancelOne === 200 && cancelRest === 200 && (weekly === 201 || weekly === 200), `${editStatus}/${cancelOne}/${cancelRest}/${weekly}`);

  // REQ-30: two saves of one slot at the same instant cannot both land, and a doubled request lands once.
  // Wednesday 15:00 and 13:00 are inside Ryan's hours (the bookings above used them); these weeks are free then.
  const race = await teacher.evaluate(async ({ base, staffId, studentId, first, second }) => {
    const post = (requestId, startDate, startTime) => fetch(`${base}/api/scheduler/classes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, staffId, studentId, subject: "MCR3U", kind: "one_off", startDate, startTime, durationMinutes: 60, effectiveUntil: null }),
    });
    const read = async (r) => ({ status: r.status, timing: r.headers.get("server-timing"), body: await r.json().catch(() => null) });
    const clash = await Promise.all([post(crypto.randomUUID(), first, "15:00"), post(crypto.randomUUID(), first, "15:00")].map((p) => p.then(read)));
    const id = crypto.randomUUID();
    const twice = await Promise.all([post(id, second, "13:00"), post(id, second, "13:00")].map((p) => p.then(read)));
    const list = await (await fetch(`${base}/api/scheduler/classes/occurrences?from=${first}&to=${first}&staffId=${staffId}`)).json();
    return { clash, twice, atSlot: list.occurrences.filter((o) => o.startTime === "15:00" && o.studentId === studentId).length };
  }, { base: BASE, staffId: RYAN_ID, studentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003", first: plus(classDay, 2), second: plus(classDay, 16) });
  const summary = (rs) => rs.map((r) => `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`).join(" | ");
  check("two parallel bookings of one slot give one 201 and one 422 booking_conflict, and the calendar shows one class",
    race.clash.map((r) => r.status).sort().join() === "201,422" && race.clash.find((r) => r.status === 422)?.body?.error === "booking_conflict" && race.atSlot === 1,
    `${summary(race.clash)} atSlot=${race.atSlot}`);
  check("two parallel bookings with one request ID give one 201 and one 200 with the same class",
    race.twice.map((r) => r.status).sort().join() === "200,201" && race.twice[0].body?.series?.id === race.twice[1].body?.series?.id, summary(race.twice));
  check("a class write response carries a Server-Timing header", race.clash.every((r) => /db;dur=/.test(r.timing ?? "")), race.clash.map((r) => r.timing).join(" | "));

  // REQ-9: nothing above reached Lessons or a payout field, and no other tracker table changed.
  const journal = await (await fetch(`${MOCK_NOTION}/__journal`)).json();
  check("no Notion request, of any method, names the Lessons data source or the lesson page",
    !journal.some((j) => LESSONS_RE.test(j.path)) && journal.length > 0, `${journal.length} requests`);
  const studentPatches = journal.filter((j) => j.method === "PATCH" && /\/v1\/pages\/bbbbbbbb-/.test(j.path));
  check("every student-page PATCH carries exactly the property Weekly Schedule",
    studentPatches.length > 0 && studentPatches.every((j) => JSON.stringify(Object.keys(j.body?.properties ?? {})) === '["Weekly Schedule"]'), `${studentPatches.length} patches`);
  if (tablesBefore) {
    const after = snapshot();
    check("every tracker table outside scheduling is identical before and after the booking flow", JSON.stringify(after) === JSON.stringify(tablesBefore) && Object.keys(after).length > 0,
      Object.keys(after).filter((t) => after[t] !== tablesBefore[t]).join(","));
  } else {
    check("every tracker table outside scheduling is identical before and after the booking flow (PG_URL missing)", false);
  }
  check("the seeded lesson reads back unchanged and was never requested by the tracker", (await (await fetch(lessonUrl, { headers: { "x-e2e-probe": "1" } })).text()) === lessonBefore && lessonBefore.includes('"Paid to Teacher"'));

  // REQ-28: the week editor reports each Notion export after a save, with a Retry that re-runs only that export.
  const NOBODY = "Nobody Booked";
  const failLine = `Weekly Schedule for ${NOBODY}: Failed. The Notion save failed.`;
  const scheduleFail = () => fetch(`${MOCK_NOTION}/__schedule/fail`, { method: "POST", headers: { "x-e2e-probe": "1" } }).then((r) => r.json());
  await teacher.setViewportSize({ width: 1200, height: 900 });
  await teacher.goto(`${BASE}/schedule?staffId=${RYAN_ID}&date=${plus(classDay, 9)}`);
  await teacher.getByRole("button", { name: "Book a class" }).waitFor({ timeout: 15000 });
  check("the mock now fails Weekly Schedule writes", (await scheduleFail()).scheduleFails === true);
  await teacher.getByRole("button", { name: "Book a class" }).click();
  const book28 = teacher.getByRole("dialog", { name: "Book a class" });
  await book28.getByLabel("Student").selectOption({ label: NOBODY });
  await book28.getByLabel("Subject").fill("MHF4U");
  await book28.getByLabel("Date").fill(plus(classDay, 9));
  await book28.getByLabel("Start time").fill("10:00");
  // Weekly, so the generated Weekly Schedule text really changes and Notion is written.
  await book28.getByLabel("Repeats weekly").check();
  await book28.getByRole("button", { name: "Book class" }).click();
  const failShown = await teacher.getByText(failLine, { exact: true }).waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("a booking whose Weekly Schedule write failed says so, with a Retry",
    failShown && (await teacher.getByRole("button", { name: "Retry Weekly Schedule" }).isVisible()) && (await teacher.getByText("Saved.", { exact: true }).isVisible()),
    failShown ? "" : `${await book28.getByRole("alert").textContent({ timeout: 2000 }).catch(() => "no alert")} | ${await teacher.getByRole("status").nth(1).textContent({ timeout: 2000 }).catch(() => "no status")}`);
  check("the mock recovers", (await scheduleFail()).scheduleFails === false);
  let classCalls = 0;
  const countClasses = (req) => { if (req.url().includes("/api/scheduler/classes")) classCalls++; };
  teacher.on("request", countClasses);
  await teacher.getByRole("button", { name: "Retry Weekly Schedule" }).click();
  const synced = await teacher.getByText(`Weekly Schedule for ${NOBODY}: Synced.`, { exact: true }).waitFor({ timeout: 15000 }).then(() => true, () => false);
  teacher.off("request", countClasses);
  check("Retry re-runs only the summary: Synced, no Retry left, no class request",
    synced && (await teacher.getByRole("button", { name: "Retry Weekly Schedule" }).count()) === 0 && classCalls === 0, `synced=${synced} classCalls=${classCalls}`);

  // A drag-move (this class only) whose daily task failed (the response is rewritten) shows the daily line and its Retry.
  await teacher.route("**/api/scheduler/classes/**", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, dailyTask: "failed" } });
  });
  const oneOff = teacher.getByRole("button", { name: /Nobody Booked/ }).filter({ hasText: "MHF4U" }).first();
  await oneOff.waitFor({ timeout: 15000 });
  const atBox = await oneOff.boundingBox();
  await teacher.mouse.move(atBox.x + atBox.width / 2, atBox.y + 8);
  await teacher.mouse.down();
  await teacher.mouse.move(atBox.x + atBox.width / 2 + atBox.width * 1.2, atBox.y + 8, { steps: 8 });
  await teacher.mouse.move(atBox.x + atBox.width / 2 + atBox.width * 2, atBox.y + 8, { steps: 8 });
  await teacher.mouse.up();
  const ask28 = teacher.getByRole("dialog", { name: "Move this class?" });
  await ask28.waitFor({ timeout: 5000 });
  await ask28.getByRole("button", { name: "Move" }).click();
  const dailyFail = await teacher.getByText("Today's Notion task could not be updated.", { exact: true }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  await teacher.unroute("**/api/scheduler/classes/**");
  check("a drag-move now shows a notice, and a failed daily task has its own Retry",
    dailyFail && (await teacher.getByRole("button", { name: "Retry today's task" }).isVisible()),
    dailyFail ? "" : await teacher.getByRole("status").nth(1).textContent().catch(() => "no status"));
  await teacher.getByRole("button", { name: "Retry today's task" }).click();
  await teacher.getByRole("button", { name: "Retry today's task" }).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await teacher.waitForTimeout(500);
  check("after the daily Retry neither the notice nor the status line says could not be updated",
    (await teacher.getByRole("button", { name: "Retry today's task" }).count()) === 0 && (await teacher.getByText(/could not be updated/).count()) === 0);

  // Delete: Cancel class, This class and future, on the weekly class. It ends the series and syncs the summary.
  await teacher.goto(`${BASE}/schedule?staffId=${RYAN_ID}&date=${plus(classDay, 16)}`);
  const weeklyCard = teacher.getByRole("button", { name: /Nobody Booked/ }).filter({ hasText: "15:00" });
  await weeklyCard.waitFor({ timeout: 15000 });
  await weeklyCard.click();
  await teacher.getByRole("dialog").filter({ hasText: NOBODY }).getByRole("button", { name: "Cancel class" }).click();
  const del = teacher.getByRole("dialog", { name: "Cancel class" });
  await del.getByLabel("This class and future").check();
  await del.getByRole("button", { name: "Cancel class" }).click();
  const deleted = await teacher.getByText(`Weekly Schedule for ${NOBODY}: Synced.`, { exact: true }).waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("delete (cancel this class and future) shows Saved. and the Weekly Schedule Synced line",
    deleted && (await teacher.getByText("Saved.", { exact: true }).isVisible()), deleted ? "" : await del.getByRole("alert").textContent().catch(() => "no alert"));

  // REQ-15: the owner sees who claimed Sam, unlinks with a corrected address, and the right person takes over.
  await teacher.goto(`${BASE}`);
  check("the owner's list shows who claimed Sam", await teacher.getByText("Signed in as sam@example.com").first().isVisible());
  await teacher.goto(`${BASE}${studentPath}`);
  // An earlier step archived Sam, and an archived student cannot be claimed again.
  const restore = teacher.getByRole("button", { name: "Restore student" });
  if (await restore.count()) {
    await restore.click();
    await teacher.getByRole("button", { name: "Archive student" }).waitFor({ timeout: 15000 });
  }
  const invite = section(teacher, "Invite");
  check("the Invite card names the login", await invite.getByText("Signed in as sam@example.com").isVisible());
  teacher.once("dialog", (d) => d.accept());
  await invite.getByLabel("Correct email").fill("sam.real@example.com");
  await invite.getByRole("button", { name: "Unlink", exact: true }).click();
  // On success the card re-renders as unclaimed, so the form (and its "Unlinked" note) goes away.
  await invite.getByText(/has not signed in yet/).waitFor({ timeout: 15000 });
  const sam = await signedIn(browser, "sam@example.com");
  await sam.goto(`${BASE}`);
  check("the old login no longer reaches Sam's dashboard", (await sam.getByRole("heading", { name: "Hi Sam" }).count()) === 0);
  const samReal = await signedIn(browser, "sam.real@example.com");
  await samReal.goto(`${BASE}`);
  const realH1 = await samReal.locator("h1").first().textContent();
  check("the corrected address now sees Hi Sam", realH1 === "Hi Sam", `${realH1} | ${(await samReal.locator("body").innerText()).slice(0, 200)}`);
  await teacher.goto(`${BASE}`);
  check("the list now shows the corrected login", await teacher.getByText("Signed in as sam.real@example.com").first().isVisible());
  // REQ-22: parents. Ada (published) and Bo (not published) share one parent email; Cy is unlinked.
  const ORG = "10000000-0000-0000-0000-00000000aaaa";
  psql(`insert into tracker.students (org_id, teacher_id, email, first_name, last_initial, grade_level, status, published_at) values
    ('${ORG}', '00000000-0000-0000-0000-00000000aaaa', 'ada@example.com', 'Ada', 'P', 11, 'active', now()),
    ('${ORG}', '00000000-0000-0000-0000-00000000aaaa', 'bo@example.com', 'Bo', 'Q', 11, 'setup', null),
    ('${ORG}', '00000000-0000-0000-0000-00000000aaaa', 'cy@example.com', 'Cy', 'R', 11, 'active', now())`);
  const kid = (name) => psql(`select id from tracker.students where first_name = '${name}'`);
  const [adaId, boId, cyId] = [kid("Ada"), kid("Bo"), kid("Cy")];
  psql(`insert into tracker.parent_links (org_id, student_id, email, invited_by) values ('${ORG}', '${boId}', 'parent@example.com', '00000000-0000-0000-0000-00000000aaaa')`);

  // REQ-23: Ada gets a goal, six plan courses and one other course by psql, with no marks, before the parent first signs in.
  const adaSql = (q) => psql(q.replaceAll("$ADA", adaId).replaceAll("$ORG", ORG));
  adaSql(`insert into tracker.goals (org_id, student_id, school, program, application_year, target_six_avg) values ('$ORG', '$ADA', 'Waterloo', 'Software Engineering', 2027, 92)`);
  adaSql(`insert into tracker.courses (org_id, student_id, code, name, in_six_plan, position, target_grade) select '$ORG', '$ADA', v.code, v.name, v.plan, v.pos, 92 from (values ('MHF4U','Advanced Functions',true,0),('MCV4U','Calculus',true,1),('SPH4U','Physics',true,2),('SCH4U','Chemistry',true,3),('ENG4U','English',true,4),('ICS4U','Computer Science',true,5),('MUS3M','Music',false,6)) as v(code, name, plan, pos)`);
  adaSql(`insert into tracker.syllabus_versions (org_id, student_id, course_id, version) select '$ORG', '$ADA', id, 1 from tracker.courses where student_id = '$ADA'`);
  adaSql(`insert into tracker.categories (org_id, student_id, course_id, syllabus_version_id, name, weight) select '$ORG', '$ADA', course_id, id, 'Work', 100 from tracker.syllabus_versions where student_id = '$ADA'`);
  adaSql(`update tracker.courses c set active_syllabus_version_id = (select v.id from tracker.syllabus_versions v where v.course_id = c.id) where c.student_id = '$ADA'`);
  adaSql(`update tracker.syllabus_versions set confirmed_at = now() where student_id = '$ADA'`);

  // The owner adds Ada's parent on the student page and sees "Invited".
  await teacher.goto(`${BASE}/students/${adaId}`);
  const parentCard = section(teacher, "Parent");
  check("the owner sees an empty Parent section", await parentCard.getByText("No parent added yet.").isVisible());
  await parentCard.getByLabel("Parent email").fill("Parent@Example.com");
  await parentCard.getByRole("button", { name: "Add parent", exact: true }).click();
  await parentCard.getByText("Invited", { exact: true }).waitFor({ timeout: 15000 });
  check("the new parent shows as Invited with an invite email link", await parentCard.getByRole("link", { name: "Open invite email" }).isVisible());
  await parentCard.getByLabel("Parent email").fill("ada@example.com");
  await parentCard.getByRole("button", { name: "Add parent", exact: true }).click();
  await parentCard.getByText("That email belongs to a student. Use the parent's own email.").first().waitFor({ timeout: 15000 });
  check("a student's own email is refused as a parent", true);

  // A teacher (not an owner) has no Parent section.
  const teacher2 = await signedIn(browser, "teacher2@example.com");
  psql(`insert into tracker.memberships (user_id, org_id, role) select id, '${ORG}', 'teacher' from auth.users where email = 'teacher2@example.com'`);
  await teacher2.goto(`${BASE}/students/${adaId}`);
  await teacher2.getByRole("heading", { name: /Ada/ }).first().waitFor({ timeout: 15000 });
  check("a teacher's student page has no Parent section", (await teacher2.getByRole("heading", { name: "Parent", exact: true }).count()) === 0);

  // The parent signs in: lands on Ada's grades, switches to Bo, never meets Cy.
  const parent = await signedIn(browser, "parent@example.com");
  await parent.goto(`${BASE}`);
  await parent.waitForURL(new RegExp(`/parent/${adaId}/grades$`), { timeout: 15000 });
  check("a parent opening the tracker lands on the first child's Grades", parent.url().endsWith(`/parent/${adaId}/grades`));
  check("with no marks, Recent marks says No marks yet", await parent.getByText("No marks yet", { exact: true }).isVisible());
  check("with no marks, the course rows say No grades yet", (await section(parent, "Subjects").getByText("No grades yet", { exact: true }).count()) >= 6);
  check("with no marks, the footer still shows", await parent.getByText("Current grades are calculated based on existing marked grades.").last().isVisible());
  check("the top bar shows AP Academy and the parent's email", (await parent.getByText("AP Academy", { exact: true }).count()) > 0 && await parent.getByText("parent@example.com").isVisible());
  check("the shell has no input, textarea or select", (await parent.locator("input, textarea, select").count()) === 0);
  check("the shell does not scroll sideways at 375px", await parent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check("both children show as pills, the Cy pill does not", await parent.getByRole("link", { name: "Ada", exact: true }).isVisible() && await parent.getByRole("link", { name: "Bo", exact: true }).isVisible() && (await parent.getByText("Cy").count()) === 0);
  // REQ-23: seven scored marks, one excused and one unscored item, then the full Grades tab.
  const mark = (title, code, daysAgo, earned, possible, kind = "assignment") =>
    adaSql(`insert into tracker.assessments (org_id, student_id, course_id, category_id, title, kind, due_date, held_on, score_earned, score_possible) select '$ORG', '$ADA', c.id, k.id, '${title}', '${kind}', ${kind === "test" ? "null" : `current_date - ${daysAgo}`}, ${kind === "test" ? `current_date - ${daysAgo}` : "null"}, ${earned}, ${possible} from tracker.courses c join tracker.categories k on k.course_id = c.id where c.student_id = '$ADA' and c.code = '${code}'`);
  mark("Unit 2 test", "MHF4U", 1, 41, 42, "test");
  mark("Calculus quiz", "MCV4U", 2, 8, 10);
  mark("Physics lab", "SPH4U", 3, 18, 20);
  mark("Functions homework", "MHF4U", 4, 9, 10);
  mark("Limits quiz", "MCV4U", 5, 7, 10);
  mark("Kinematics lab", "SPH4U", 6, 15, 20);
  mark("Functions quiz", "MHF4U", 7, 10, 10);
  adaSql(`insert into tracker.assessments (org_id, student_id, course_id, category_id, title, due_date, excused, score_possible) select '$ORG', '$ADA', c.id, k.id, 'Excused task', current_date, true, 10 from tracker.courses c join tracker.categories k on k.course_id = c.id where c.student_id = '$ADA' and c.code = 'MHF4U'`);
  adaSql(`insert into tracker.assessments (org_id, student_id, course_id, category_id, title, due_date, score_possible) select '$ORG', '$ADA', c.id, k.id, 'Unmarked task', current_date, 10 from tracker.courses c join tracker.categories k on k.course_id = c.id where c.student_id = '$ADA' and c.code = 'MCV4U'`);
  await parent.reload();
  const gradeHeadings = await parent.locator("main h1, main h2").allTextContents();
  check("the Grades tab headings are in order", JSON.stringify(gradeHeadings.map((t) => t.trim())) === JSON.stringify(["Ada P.", "Target", "Progress", "Subjects", "Also taking", "Recent marks", "Next priorities", "Upcoming"]), JSON.stringify(gradeHeadings));
  check("the Target section shows the goal's school", await section(parent, "Target").getByText("Waterloo").isVisible());
  const progressText = await section(parent, "Progress").innerText();
  check("the Progress section shows the count and the story line", /3 of 6 courses graded/.test(progressText) && progressText.includes("2 courses are below their targets: MCV4U and SPH4U."), progressText);
  check("Subjects has six course rows", (await section(parent, "Subjects").locator("ul").first().locator("> li").count()) === 6);
  const mainText = await parent.locator("main").innerText();
  const recentText = mainText.slice(mainText.indexOf("Recent marks"), mainText.indexOf("Next priorities"));
  const recentOrder = ["Unit 2 test", "Calculus quiz", "Physics lab", "Functions homework", "Limits quiz"].map((t) => recentText.indexOf(t));
  check("Recent marks lists the 5 newest in date order", recentOrder.every((i, n) => i >= 0 && (n === 0 || i > recentOrder[n - 1])) && !recentText.includes("Kinematics lab") && !recentText.includes("Excused task") && !recentText.includes("Unmarked task"), recentText);
  check("a recent mark shows its score and percent", recentText.includes("41 / 42") && recentText.includes("97.6%"));
  check("the last paragraph in main is the grade footer", (await parent.locator("main p").last().textContent()) === "Current grades are calculated based on existing marked grades.");
  // Read-only: one button (Sign out), no form controls, links for pills and tabs, no student-only cards.
  const buttons = await parent.locator("button").allTextContents();
  check("the parent Grades tab has only the Sign out button", buttons.length === 1 && /sign out/i.test(buttons[0]), JSON.stringify(buttons));
  check("the parent Grades tab has no input, textarea or select", (await parent.locator("input, textarea, select").count()) === 0);
  check("the child pills are links", await parent.getByRole("link", { name: "Ada", exact: true }).isVisible() && await parent.getByRole("link", { name: "Bo", exact: true }).isVisible());
  check("no chart hint, Got it, Extra practice or course link", (await parent.getByText("Tap a point to see the marks behind it.").count()) === 0 && (await parent.getByText("Got it").count()) === 0 && (await parent.getByText("Extra practice").count()) === 0 && (await parent.locator('a[href*="/courses/"]').count()) === 0);
  const adaMhf = section(parent, "Subjects").locator("li", { hasText: "Advanced Functions" }).first();
  await adaMhf.locator("svg [role=button]").last().click();
  check("tapping the newest point reveals its marks", await adaMhf.getByText(/grade after these marks \d+\.\d%/).isVisible() && await adaMhf.getByText("Unit 2 test · 41 / 42 · 97.6%").isVisible());
  check("the Grades tab does not scroll sideways at 375px", await parent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await parent.getByRole("link", { name: "Calendar", exact: true }).click();
  await parent.waitForURL(/\/calendar$/);
  await parent.getByRole("link", { name: "Bo", exact: true }).click();
  await parent.waitForURL(new RegExp(`/parent/${boId}/calendar$`), { timeout: 15000 });
  check("switching child keeps the tab", parent.url().endsWith(`/parent/${boId}/calendar`));
  check("an unpublished child shows Not ready yet and no tab content", await parent.getByText("Not ready yet").isVisible() && (await parent.getByText("Classes will show here.").count()) === 0);
  await parent.goto(`${BASE}/parent/${boId}/grades`);
  check("an unpublished child's Grades tab shows Not ready yet and no grade headings", await parent.getByText("Not ready yet").isVisible() && (await parent.getByRole("heading", { name: /^(Recent marks|Progress|Subjects)$/ }).count()) === 0);
  check("the parent never sees Cy", (await parent.locator("body").innerText()).includes("Cy") === false);
  await parent.goto(`${BASE}/parent/${cyId}/grades`);
  check("a parent URL for an unlinked student gives the not-found state", await parent.getByText("This page could not be found").isVisible() && (await parent.locator("body").innerText()).includes("Cy") === false);
  await parent.goto(`${BASE}/parent`);
  await parent.waitForURL(new RegExp(`/parent/${adaId}/grades$`), { timeout: 15000 });
  check("/tracker/parent goes to the first child", true);

  // REQ-24: the Calendar tab. Ada gets a scheduler link and, with Ryan on today's Toronto date, one class in each
  // state (MHF4U 15:00 scheduled, MCV4U 17:00 cancelled, a one-off SPH4U 18:00, MPM2D moved 16:00 to 19:00). Cy gets Kuby's SCH4U.
  const today = isoIn(0);
  const ADA_NOTION = "dddddddd-dddd-4ddd-8ddd-dddddddd0001";
  const CY_NOTION = "dddddddd-dddd-4ddd-8ddd-dddddddd0002";
  psql(`update tracker.students set notion_student_id = '${ADA_NOTION}' where id = '${adaId}'`);
  psql(`update tracker.students set notion_student_id = '${CY_NOTION}' where id = '${cyId}'`);
  const addSeries = (student, staff, subject, kind, time) => psql(`insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values ('${ORG}', gen_random_uuid(), '${staff}', '${student}', '${subject}', '${kind}', '${today}', '${time}', 60, '00000000-0000-0000-0000-00000000aaaa') returning id`).split("\n")[0];
  const addException = (seriesId, kind, newTime) => psql(`insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, new_date, new_start_time, created_by) values ('${ORG}', gen_random_uuid(), '${seriesId}', '${today}', '${kind}', ${newTime ? `'${today}'` : "null"}, ${newTime ? `'${newTime}'` : "null"}, '00000000-0000-0000-0000-00000000aaaa')`);
  addSeries(ADA_NOTION, RYAN_ID, "MHF4U", "weekly", "15:00");
  addException(addSeries(ADA_NOTION, RYAN_ID, "MCV4U", "weekly", "17:00"), "cancelled", null);
  addSeries(ADA_NOTION, RYAN_ID, "SPH4U", "one_off", "18:00");
  addException(addSeries(ADA_NOTION, RYAN_ID, "MPM2D", "weekly", "16:00"), "moved", "19:00");
  addSeries(CY_NOTION, KUBY, "SCH4U", "weekly", "15:00");
  const calendarTablesBefore = process.env.PG_URL ? snapshot() : null;
  const calendarJournalStart = (await (await fetch(`${MOCK_NOTION}/__journal`)).json()).length;
  const fullDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).replace(",", "");
  const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const t = y * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  const calendarUrl = (id) => `${BASE}/parent/${id}/calendar`;

  await parent.goto(calendarUrl(adaId));
  const todayCell = parent.locator(`[data-date="${today}"]`);
  await todayCell.waitFor({ timeout: 15000 });
  const summaryText = await parent.locator("[data-summary]").innerText();
  check("the calendar summary line reads N classes this month · D done · U upcoming", /^\d+ classes? this month · \d+ done · \d+ upcoming$/.test(summaryText), summaryText);
  const weekText = await section(parent, "This week").innerText();
  check("This week shows the course, the teacher and every state with the moved note",
    ["MCV4U", "Ryan", "Cancelled", "Makeup", "Scheduled", "Moved from"].every((w) => weekText.includes(w)), weekText.replaceAll("\n", " | "));
  const dotStates = await todayCell.locator("[data-dots] [data-state]").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  check("today's cell shows 3 dots and +1, each toned by a state",
    dotStates.length === 3 && dotStates.every((s) => ["scheduled", "cancelled", "makeup", "moved"].includes(s)) && (await todayCell.locator("[data-dots]").innerText()).includes("+1"), JSON.stringify(dotStates));
  const cellName = (await todayCell.getAttribute("aria-label")) ?? "";
  check("today's cell is named with the full date and all four state words",
    cellName.startsWith(fullDate(today)) && ["Scheduled", "Cancelled", "Makeup", "Moved"].every((w) => cellName.includes(w)), cellName);
  await todayCell.click();
  check("tapping today lists its 4 classes", (await parent.locator("[data-day-list] li").count()) === 4);
  check("another student's class and teacher never appear", (await parent.getByText("SCH4U").count()) === 0 && !(await parent.content()).includes("Kuby"));
  check("the Calendar tab has no input, textarea or select", (await parent.locator("input, textarea, select").count()) === 0);
  check("the Calendar tab does not scroll sideways at 375px", await parent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // AC17 and AC6: hold next month's request, see the pending state, then step back two months.
  const thisYm = today.slice(0, 7);
  const [nextYm, prevYm] = [shiftYm(thisYm, 1), shiftYm(thisYm, -1)];
  let release = () => {};
  const held = new Promise((r) => { release = r; });
  const holdNext = (url) => url.searchParams.get("month") === nextYm;
  await parent.route(holdNext, async (route) => { await Promise.race([held, new Promise((r) => setTimeout(r, 10000))]); await route.continue(); });
  const nextLink = parent.getByRole("link", { name: "Next month" });
  await nextLink.click();
  await parent.waitForFunction(() => document.querySelector('a[aria-label="Next month"]')?.getAttribute("aria-busy") === "true", null, { timeout: 1200 }).catch(() => {});
  const busy = await nextLink.getAttribute("aria-busy");
  const pendingLabel = await parent.locator("[data-month-label]").innerText();
  const gridKept = await todayCell.isVisible();
  check("while the next month loads, the link is busy, the label says Loading and the month stays", busy === "true" && pendingLabel === "Loading" && gridKept, `${busy} ${pendingLabel} ${gridKept}`);
  release();
  await parent.locator("[data-month-label]", { hasText: monthName(nextYm) }).waitFor({ timeout: 15000 });
  await parent.unroute(holdNext);
  check("Next shows next month by ?month= and the busy state is gone",
    parent.url().includes(`month=${nextYm}`) && (await parent.getByRole("link", { name: "Next month" }).getAttribute("aria-busy")) === null);
  await parent.getByRole("link", { name: "Previous month" }).click();
  await parent.locator("[data-month-label]", { hasText: monthName(thisYm) }).waitFor({ timeout: 15000 });
  await parent.getByRole("link", { name: "Previous month" }).click();
  await parent.locator("[data-month-label]", { hasText: monthName(prevYm) }).waitFor({ timeout: 15000 });
  check("Previous twice shows last month", parent.url().includes(`month=${prevYm}`));

  // AC8: from 640px, full blocks tinted by state.
  await parent.setViewportSize({ width: 720, height: 900 });
  await parent.goto(calendarUrl(adaId));
  await todayCell.waitFor({ timeout: 15000 });
  const blocks = await todayCell.locator("[data-block]").evaluateAll((els) => els.map((e) => {
    const cs = getComputedStyle(e);
    return { state: e.getAttribute("data-state"), text: e.textContent, visible: e.getBoundingClientRect().width > 0, bg: cs.backgroundColor, line: cs.textDecorationLine, color: cs.color };
  }));
  check("at 720px today's blocks show and the dots are hidden", blocks.length === 4 && blocks.every((b) => b.visible) && await todayCell.locator("[data-dots]").isHidden());
  check("a block shows time, course and teacher first name", blocks.some((b) => b.text.includes("PM") && b.text.includes("MCV4U") && b.text.includes("Ryan")));
  check("each block carries its own state", JSON.stringify(blocks.map((b) => [b.state, b.text.match(/[A-Z]{3}\dU|MPM2D/)?.[0]])) === JSON.stringify([["scheduled", "MHF4U"], ["cancelled", "MCV4U"], ["makeup", "SPH4U"], ["moved", "MPM2D"]]), JSON.stringify(blocks.map((b) => b.state)));
  const cancelledBlock = blocks.find((b) => b.state === "cancelled");
  check("the cancelled block is struck through and muted", cancelledBlock?.line === "line-through" && cancelledBlock?.color === "rgb(110, 101, 91)", `${cancelledBlock?.line} ${cancelledBlock?.color}`);
  check("the four blocks have four different tints", new Set(blocks.map((b) => b.bg)).size === 4, JSON.stringify(blocks.map((b) => b.bg)));
  await parent.setViewportSize({ width: 375, height: 800 });

  // AC14: browsing the Calendar asked Notion for nothing but Staff and changed no tracker table.
  const calendarJournal = (await (await fetch(`${MOCK_NOTION}/__journal`)).json()).slice(calendarJournalStart);
  check("the Calendar never names Lessons and asks Notion only for Staff",
    !calendarJournal.some((j) => LESSONS_RE.test(j.path)) && calendarJournal.every((j) => j.method === "POST" && j.path === "/v1/data_sources/eaf8e9be-9ec3-4e0d-9442-f2c2ce111925/query"), JSON.stringify(calendarJournal.map((j) => `${j.method} ${j.path}`)));
  if (calendarTablesBefore) {
    const after = snapshot();
    check("no tracker table changed while the parent browsed the Calendar", JSON.stringify(after) === JSON.stringify(calendarTablesBefore),
      Object.keys(after).filter((t) => after[t] !== calendarTablesBefore[t]).join(","));
  } else {
    check("no tracker table changed while the parent browsed the Calendar (PG_URL missing)", false);
  }

  // AC12: a failed class read is an error, never an empty month.
  try {
    psql("revoke select on tracker.class_exceptions from authenticated");
    await parent.goto(calendarUrl(adaId));
    await parent.getByText("Could not load classes. Try again later.").waitFor({ timeout: 15000 });
    check("a failed class read shows the error and no grid, summary or empty month",
      (await parent.locator("[data-grid]").count()) === 0 && (await parent.locator("[data-summary]").count()) === 0 && (await parent.getByText("No classes this month.").count()) === 0);
  } finally {
    psql("grant select on tracker.class_exceptions to authenticated");
  }

  // AC10: a published, linked child with no scheduler link sees the not-available state.
  psql(`insert into tracker.students (org_id, teacher_id, email, first_name, last_initial, grade_level, status, published_at) values ('${ORG}', '00000000-0000-0000-0000-00000000aaaa', 'di@example.com', 'Di', 'S', 10, 'active', now())`);
  const diId = kid("Di");
  psql(`insert into tracker.parent_links (org_id, student_id, email, invited_by) values ('${ORG}', '${diId}', 'parent@example.com', '00000000-0000-0000-0000-00000000aaaa')`);
  await parent.goto(calendarUrl(diId));
  await parent.getByText("Schedule not available yet").waitFor({ timeout: 15000 });
  check("a child with no scheduler link sees Schedule not available yet and no grid", (await parent.locator("[data-grid]").count()) === 0 && (await parent.getByText("This week", { exact: true }).count()) === 0);

  // REQ-25: the Billing tab. Ada's Students & Parents page (ADA_NOTION) has a current Sent invoice due yesterday, shared
  // with Haider (Billing Family Afzal) and carrying an Applied credit, one Paid past invoice with a PDF, a $999 Draft,
  // an $888 Void and an Open credit. Cy's family has a $777 invoice and a ZZZ9Z credit. All from the mock's Invoices and
  // Missed Sessions & Credits data sources.
  const billingUrl = (id) => `${BASE}/parent/${id}/billing`;
  const pdfUrl = (child, invoice) => `${BASE}/parent/${child}/billing/invoices/${invoice}`;
  const ADA_CURRENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001";
  const ADA_PAST = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0003";
  const ADA_DRAFT = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0004";
  const CY_INVOICE = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0006";
  const billingTablesBefore = process.env.PG_URL ? snapshot() : null;
  const billingJournalStart = (await (await fetch(`${MOCK_NOTION}/__journal`)).json()).length;

  await parent.goto(billingUrl(adaId));
  await parent.locator("[data-invoice-card]").waitFor({ timeout: 15000 });
  const cardText = await parent.locator("[data-invoice-card]").innerText();
  check("the card shows this month's invoice, the amount, Overdue, the credit line and the shared line",
    /\w+ invoice/.test(cardText) && cardText.includes("$420") && cardText.includes("Credit applied: -$60") && /Missed \w{3} \d{1,2} · MHF4U/.test(cardText) && cardText.includes("Shared invoice with Haider"),
    cardText.replaceAll("\n", " | "));
  check("the card's status pill is Overdue", (await parent.locator('[data-invoice-card] [data-state="overdue"]').innerText()) === "Overdue");
  const creditsText = await section(parent, "Credits").innerText();
  check("Credits shows the Open total, an Open pill and the footnote",
    creditsText.includes("Open total") && creditsText.includes("$60") && (await section(parent, "Credits").locator('[data-state="open"]').count()) === 1 && creditsText.includes("Open credits come off your next invoice."),
    creditsText.replaceAll("\n", " | "));
  const pastLink = section(parent, "Past invoices").locator(`a[href$="/billing/invoices/${ADA_PAST}"]`);
  check("Past invoices has a Paid row that is a link", (await pastLink.count()) === 1 && (await pastLink.locator('[data-state="paid"]').count()) === 1);
  check("the rate line reads Rate: $60/h · 2x/week", await parent.getByText("Rate: $60/h · 2x/week", { exact: true }).isVisible());
  const billingHtml = await parent.content();
  const leaked = ["$999", "$888", "$777", "$315", "ZZZ9Z", "555-0199", "CANARY-NOTE", "amazonaws", "/files/", "127.0.0.1:54333"].filter((w) => billingHtml.includes(w));
  check("no Draft, Void, other family, sibling amount, canary or file link reaches the page", leaked.length === 0, leaked.join(","));
  const billingButtons = await parent.locator("button").allTextContents();
  check("the Billing tab has only the Sign out button and no input", billingButtons.length === 1 && /sign out/i.test(billingButtons[0]) && (await parent.locator("input, textarea, select").count()) === 0, JSON.stringify(billingButtons));
  check("the Billing tab does not scroll sideways at 375px", await parent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check("the Billing tab has no payment or e-transfer text and no em-dash", !/e-?transfer|pay now/i.test(await parent.locator("main").innerText()) && !(await parent.locator("main").innerText()).includes("—"));

  // AC9, AC10, AC14: the PDF route.
  const api = parent.context().request;
  const pdf = await api.get(pdfUrl(adaId, ADA_PAST), { maxRedirects: 0 });
  const pdfBody = await pdf.body();
  check("the Paid invoice's PDF is served inline with no-store",
    pdf.status() === 200 && pdf.headers()["content-type"] === "application/pdf" && /no-store/.test(pdf.headers()["cache-control"] ?? "") && pdfBody.subarray(0, 4).toString() === "%PDF" && /inline; filename="AP-E2E-0003.pdf"/.test(pdf.headers()["content-disposition"] ?? ""),
    `${pdf.status()} ${JSON.stringify(pdf.headers())}`);
  const statusOf = async (url) => (await api.get(url, { maxRedirects: 0 })).status();
  check("another family's invoice under Ada is 404", (await statusOf(pdfUrl(adaId, CY_INVOICE))) === 404);
  check("Ada's invoice under Cy (unlinked) or Bo (unpublished) is 404", (await statusOf(pdfUrl(cyId, ADA_PAST))) === 404 && (await statusOf(pdfUrl(boId, ADA_PAST))) === 404);
  check("the Draft invoice's PDF is 404", (await statusOf(pdfUrl(adaId, ADA_DRAFT))) === 404);
  check("a teacher asking for Ada's PDF is refused", (await teacher2.context().request.get(pdfUrl(adaId, ADA_CURRENT), { maxRedirects: 0 })).status() !== 200);

  // AC11, AC12: Notion saw only reads of the billing data sources and pages, each naming its properties, filtered on Ada.
  const billingJournal = (await (await fetch(`${MOCK_NOTION}/__journal`)).json()).slice(billingJournalStart);
  const billingPaths = /^\/v1\/(data_sources\/(be0f91e4-f054-4055-9ca6-c4e1a22c4f27|38cdcded-9bef-4e68-bceb-a56920f098bd|fe3d651a-70c6-4d1e-8a38-656163d6bc63)(\/query)?|pages\/[0-9a-f-]{36})(\?.*)?$|^\/files\//;
  const queries = billingJournal.filter((j) => j.path.includes("/query"));
  const relationIds = queries.flatMap((j) => JSON.stringify(j.body).match(/"contains":"[^"]+"/g) ?? []);
  check("Billing asked Notion only for billing reads, with filter_properties, filtered on Ada, never Lessons or a write",
    billingJournal.length > 0 && billingJournal.every((j) => ["GET", "POST"].includes(j.method) && billingPaths.test(j.path)) &&
      billingJournal.every((j) => j.method !== "POST" || j.path.includes("/query")) &&
      billingJournal.filter((j) => j.path.startsWith("/v1/pages/") || j.path.includes("/query")).every((j) => j.path.includes("filter_properties")) &&
      relationIds.length >= 2 && relationIds.every((r) => r === `"contains":"${ADA_NOTION}"`) && !billingJournal.some((j) => LESSONS_RE.test(j.path)),
    JSON.stringify(billingJournal.map((j) => `${j.method} ${j.path}`)));
  if (billingTablesBefore) {
    const after = snapshot();
    check("no tracker table changed while the parent browsed Billing", JSON.stringify(after) === JSON.stringify(billingTablesBefore),
      Object.keys(after).filter((t) => after[t] !== billingTablesBefore[t]).join(","));
  } else {
    check("no tracker table changed while the parent browsed Billing (PG_URL missing)", false);
  }

  // AC13: a failed invoices read is an error, never an empty month; a child with no Notion link is not available.
  try {
    await fetch(`${MOCK_NOTION}/__billing/fail`, { method: "POST", headers: { "x-e2e-probe": "1" } });
    await parent.goto(billingUrl(adaId));
    await parent.getByText("Could not load billing. Try again later.").waitFor({ timeout: 15000 });
    check("a failed invoices read shows the error and no cards or empty states",
      (await parent.getByText("No invoice yet this month").count()) === 0 && (await parent.locator("[data-invoice-card]").count()) === 0 && (await parent.getByRole("heading", { name: "Credits" }).count()) === 0);
  } finally {
    await fetch(`${MOCK_NOTION}/__billing/fail`, { method: "POST", headers: { "x-e2e-probe": "1" } });
  }
  await parent.goto(billingUrl(diId));
  await parent.getByText("Billing not available yet").waitFor({ timeout: 15000 });
  check("a child with no Notion link sees Billing not available yet and no cards", (await parent.locator("[data-invoice-card]").count()) === 0 && (await parent.getByRole("heading", { name: "Credits" }).count()) === 0);

  // Teachers, owners and students are sent back to the tracker home.
  await teacher.goto(`${BASE}/parent`);
  check("an owner opening /tracker/parent is redirected", new URL(teacher.url()).pathname.replace(/\/$/, "") === "/tracker");
  await teacher2.goto(`${BASE}/parent/${adaId}/grades`);
  check("a teacher opening a parent route is redirected", new URL(teacher2.url()).pathname.replace(/\/$/, "") === "/tracker");
  await samReal.goto(`${BASE}/parent`);
  check("a student opening /tracker/parent is redirected to their dashboard", new URL(samReal.url()).pathname.replace(/\/$/, "") === "/tracker" && await samReal.getByRole("heading", { name: "Hi Sam" }).isVisible());

  // The owner shows Ada's parent as signed in, removes them, and Ada is no longer visible to the parent.
  await teacher.goto(`${BASE}/students/${adaId}`);
  await section(teacher, "Parent").getByText("Signed in", { exact: true }).waitFor({ timeout: 15000 });
  teacher.once("dialog", (d) => d.accept());
  await section(teacher, "Parent").getByRole("button", { name: "Remove", exact: true }).click();
  await section(teacher, "Parent").getByText("No parent added yet.").waitFor({ timeout: 15000 });
  await parent.goto(`${BASE}/parent/${adaId}/grades`);
  check("after removal the parent gets not-found for Ada", await parent.getByText("This page could not be found").isVisible());

  // REQ-21: scheduler GET routes carry Server-Timing through the landing proxy.
  const timing = teacher;
  const timingRes = await timing.context().request.get(`${BASE}/api/scheduler/me`);
  const st = timingRes.headers()["server-timing"] ?? "";
  check("scheduler GET carries Server-Timing auth, db and total", timingRes.status() === 200 && /auth;dur=/.test(st) && /db;dur=/.test(st) && /total;dur=/.test(st), `${timingRes.status()} ${st}`);
} catch (error) {
  check("flow ran to the end", false, String(error).split("\n")[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
