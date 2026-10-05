// Tracker end-to-end flows (build steps 4 to 9) in Chromium, against the
// local stack (stack.sh): a teacher onboards a student, publishes, the student
// signs in, marks work done, and sees a score the teacher enters. Then v1:
// a priority suggestion, a grade flag, and AI drafts against a mock model.
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
    await add.getByLabel("Due date").fill(due);
    await add.getByLabel("Score").fill(earned);
    await add.getByLabel("Out of").fill(possible);
    await add.getByRole("button", { name: "Add", exact: true }).click();
    await card.locator("li", { hasText: title }).first().waitFor({ timeout: 15000 });
  }
  const grade = (await section(teacher, "Current grade").locator("p").first().textContent())?.trim();
  check("the brief's reference example shows 96.5%", grade === "96.5%", grade);

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
  const order = ["Target", "Progress", "Active subjects", "Next priorities", "Upcoming"];
  check("dashboard order: target, progress, subjects, priorities, upcoming", order.every((h, i) => headings.indexOf(h) === i), headings.join(" > "));
  check("progress names a partial average honestly", await student.getByText("Average of 1 graded course").isVisible());
  check("progress shows 96.5%", await section(student, "Progress").getByText("96.5%").isVisible());
  check("the grade note is shown", await student.getByText("Current grades are calculated based on existing marked grades.").first().isVisible());
  check("supplemental work is kept separate", await section(student, "Extra practice").getByText("Practice set 4").isVisible());
  check("no admission likelihood language", !(await student.locator("body").textContent()).match(/chance|likely|likelihood|probability|admit/i));
  check("the student has nothing to type", (await student.locator("input, textarea, select").count()) === 0);

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
  await section(student, "Active subjects").getByRole("link", { name: /MHF4U/ }).click();
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
  await section(student, "Active subjects").getByRole("link", { name: /MHF4U/ }).click();
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
} catch (error) {
  check("flow ran to the end", false, String(error).split("\n")[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
