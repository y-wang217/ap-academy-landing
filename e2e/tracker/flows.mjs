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
  await teacher.getByText("Nobody Booked").locator("visible=true").first().waitFor({ timeout: 15000 });
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
} catch (error) {
  check("flow ran to the end", false, String(error).split("\n")[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
