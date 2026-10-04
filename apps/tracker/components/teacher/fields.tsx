import { Field, inputClass } from "../ui";

// Shared form fields. Server-rendered; values come back on failure because
// ActionForm never resets a form that failed to save.

export const STUDENT_LABELS = { firstName: "First name", lastInitial: "Last initial", gradeLevel: "Grade", email: "Email" };
export function StudentFields({ defaults }: { defaults?: { firstName: string; lastInitial: string; gradeLevel: number; email: string } }) {
  return (
    <>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label="First name" name="firstName">
          <input id="firstName" name="firstName" required maxLength={50} defaultValue={defaults?.firstName} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Last initial" name="lastInitial">
          <input id="lastInitial" name="lastInitial" required maxLength={1} defaultValue={defaults?.lastInitial} className={inputClass} autoComplete="off" />
        </Field>
      </div>
      <Field label="Grade" name="gradeLevel">
        <select id="gradeLevel" name="gradeLevel" defaultValue={String(defaults?.gradeLevel ?? 11)} className={inputClass}>
          {[9, 10, 11, 12].map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Student email" name="email" hint="They sign in with this address. Nothing else about the student is stored.">
        <input id="email" name="email" type="email" required defaultValue={defaults?.email} className={inputClass} autoComplete="off" />
      </Field>
    </>
  );
}

export const GOAL_LABELS = { school: "School", program: "Program", applicationYear: "Application year", targetSixAvg: "Target six-course average", benchmarkNote: "Benchmark note" };
export function GoalFields({ defaults }: { defaults?: { school: string; program: string; applicationYear: number | null; targetSixAvg: number; benchmarkNote: string | null } | null }) {
  return (
    <>
      <Field label="School" name="school">
        <input id="school" name="school" required defaultValue={defaults?.school} className={inputClass} placeholder="University of Waterloo" />
      </Field>
      <Field label="Program" name="program">
        <input id="program" name="program" required defaultValue={defaults?.program} className={inputClass} placeholder="Software Engineering" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Application year" name="applicationYear">
          <input id="applicationYear" name="applicationYear" inputMode="numeric" defaultValue={defaults?.applicationYear ?? ""} className={inputClass} />
        </Field>
        <Field label="Target six-course average (%)" name="targetSixAvg">
          <input id="targetSixAvg" name="targetSixAvg" inputMode="decimal" required defaultValue={defaults?.targetSixAvg ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Benchmark note" name="benchmarkNote" hint="Optional. Where the target comes from.">
        <textarea id="benchmarkNote" name="benchmarkNote" rows={2} defaultValue={defaults?.benchmarkNote ?? ""} className={inputClass} />
      </Field>
    </>
  );
}

export const COURSE_LABELS = { code: "Code", name: "Name", term: "Term", status: "Status", inSixPlan: "In six-course plan" };
export function CourseFields({ defaults, idPrefix = "course" }: { defaults?: { code: string; name: string; term: string; status: string; inSixPlan: boolean }; idPrefix?: string }) {
  return (
    <>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <Field label="Code" name={`${idPrefix}-code`}>
          <input id={`${idPrefix}-code`} name="code" required maxLength={20} defaultValue={defaults?.code} className={inputClass} placeholder="MHF4U" />
        </Field>
        <Field label="Name" name={`${idPrefix}-name`}>
          <input id={`${idPrefix}-name`} name="name" required defaultValue={defaults?.name} className={inputClass} placeholder="Advanced Functions" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Term" name={`${idPrefix}-term`}>
          <input id={`${idPrefix}-term`} name="term" defaultValue={defaults?.term} className={inputClass} placeholder="Fall 2026" />
        </Field>
        <Field label="Status" name={`${idPrefix}-status`}>
          <select id={`${idPrefix}-status`} name="status" defaultValue={defaults?.status ?? "active"} className={inputClass}>
            <option value="active">Active</option>
            <option value="planned">Planned</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="inSixPlan" defaultChecked={defaults?.inSixPlan ?? true} className="h-4 w-4 accent-accent" />
        Counts toward the six-course average
      </label>
    </>
  );
}

export const CATEGORY_LABELS = { name: "Name", weight: "Weight", aggregationMethod: "How marks combine", needsReview: "Needs review" };
export function CategoryFields({ defaults, idPrefix }: { defaults?: { name: string; weight: number; aggregationMethod: string; needsReview: boolean }; idPrefix: string }) {
  return (
    <>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label="Category" name={`${idPrefix}-name`}>
          <input id={`${idPrefix}-name`} name="name" required defaultValue={defaults?.name} className={inputClass} placeholder="Tests" />
        </Field>
        <Field label="Weight (%)" name={`${idPrefix}-weight`}>
          <input id={`${idPrefix}-weight`} name="weight" inputMode="decimal" required defaultValue={defaults?.weight ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="How marks combine" name={`${idPrefix}-method`}>
        <select id={`${idPrefix}-method`} name="aggregationMethod" defaultValue={defaults?.aggregationMethod ?? "mean_of_percentages"} className={inputClass}>
          <option value="mean_of_percentages">Average of percentages</option>
          <option value="pooled_points">Total points earned over total possible</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="needsReview" defaultChecked={defaults?.needsReview ?? false} className="h-4 w-4 accent-accent" />
        The syllabus uses a rule not listed here (flag for review)
      </label>
    </>
  );
}

export const ASSESSMENT_LABELS = { title: "Title", categoryId: "Category", dueDate: "Due date", scorePossible: "Out of", scoreEarned: "Score" };
export function AssessmentFields({ categories }: { categories: { id: string; name: string }[] }) {
  return (
    <>
      <Field label="Title" name="new-title">
        <input id="new-title" name="title" required className={inputClass} placeholder="Unit 2 test" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" name="new-category">
          <select id="new-category" name="categoryId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Pick one
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date" name="new-due">
          <input id="new-due" name="dueDate" type="date" className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Score" name="new-earned" hint="Leave blank if not marked yet.">
          <input id="new-earned" name="scoreEarned" inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Out of" name="new-possible">
          <input id="new-possible" name="scorePossible" inputMode="decimal" required className={inputClass} />
        </Field>
      </div>
    </>
  );
}

export const TASK_LABELS = { title: "Title", kind: "Type", courseId: "Course", reason: "Why", pinned: "Pin" };
export function TaskFields({ courses }: { courses: { id: string; code: string }[] }) {
  return (
    <>
      <Field label="Task" name="task-title">
        <input id="task-title" name="title" required className={inputClass} placeholder="Redo the factor theorem questions" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" name="task-kind">
          <select id="task-kind" name="kind" defaultValue="school" className={inputClass}>
            <option value="school">School work priority</option>
            <option value="supplemental">Extra practice (not graded)</option>
          </select>
        </Field>
        <Field label="Course" name="task-course">
          <select id="task-course" name="courseId" defaultValue="" className={inputClass}>
            <option value="">Any course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Why (shown to the student)" name="task-reason">
        <input id="task-reason" name="reason" className={inputClass} placeholder="Test on Friday" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pinned" defaultChecked className="h-4 w-4 accent-accent" />
        Pin to the top
      </label>
    </>
  );
}
