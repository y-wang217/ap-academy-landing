import Link from "next/link";
import {
  addAssessment, addCategory, addSuggestedTask, addTask, deleteAssessment, deleteCategory, deleteTask, moveTask, resolveFlag, saveScore,
  setTaskPinned, updateCategory,
} from "@/app/actions/teacher";
import { STATE_LABEL } from "@/lib/domain/assessment-state";
import { percent, points, shortDate, stamp } from "@/lib/format";
import { FLAG_LABEL } from "@/lib/view/flags";
import type { CourseView, StudentView } from "@/lib/view/student-view";
import { TRACKER_URL } from "@/lib/config";
import { ActionButton, ActionForm } from "../action-form";
import { Card, Empty, Field, Notice, StateBadge, inputClass, linkClass, secondaryButtonClass } from "../ui";
import { ASSESSMENT_LABELS, AssessmentFields, CATEGORY_LABELS, CategoryFields, TASK_LABELS, TaskFields } from "./fields";

const small = "rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium hover:bg-background disabled:opacity-50";

/** Categories and weights. Editable until the syllabus is confirmed at publish (ADR 0018). */
export function SyllabusEditor({ view }: { view: CourseView }) {
  const confirmed = view.version?.confirmedAt != null;
  const total = view.categories.reduce((s, c) => s + c.weight, 0);
  const weightError = view.syllabusErrors.find((e) => e.kind === "weights_not_100");

  if (confirmed) {
    return (
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col divide-y divide-border">
          {view.categories.map((c) => (
            <li key={c.id} className="flex justify-between gap-3 py-2 text-sm">
              <span>
                {c.name}
                {c.needsReview && <span className="ml-2 text-warn">Needs review</span>}
              </span>
              <span>
                {points(c.weight)}% · {c.aggregationMethod === "pooled_points" ? "total points" : "average of percentages"}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-muted">Confirmed at publish. A changed syllabus needs a new version (not built yet).</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {view.categories.length === 0 && <Empty>No categories yet. Add the syllabus weights below.</Empty>}
      {view.categories.map((c) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <ActionForm action={updateCategory.bind(null, c.id)} labels={CATEGORY_LABELS} secondary submitLabel="Save category">
            <CategoryFields idPrefix={`cat-${c.id}`} defaults={c} />
          </ActionForm>
          <div>
            <ActionButton action={deleteCategory.bind(null, c.id)} label="Remove category" confirm={`Remove ${c.name}?`} className={small} />
          </div>
        </div>
      ))}
      <p className={`text-sm font-medium ${weightError ? "text-warn" : "text-ok"}`}>
        Weights add up to {points(Math.round(total * 1000) / 1000)}%.{weightError ? " They must add up to 100." : ""}
      </p>
      <details className="rounded-xl border border-dashed border-border p-3" open={view.categories.length === 0}>
        <summary className="cursor-pointer text-sm font-medium">Add a category</summary>
        <div className="pt-3">
          <ActionForm action={addCategory.bind(null, view.course.id)} labels={CATEGORY_LABELS} submitLabel="Add category" resetOnSuccess>
            <CategoryFields idPrefix={`new-cat-${view.course.id}`} />
          </ActionForm>
        </div>
      </details>
    </div>
  );
}

/** Assessments: add upcoming items, then enter the score on the same record. */
export function AssessmentManager({ view }: { view: CourseView }) {
  const order = { upcoming: 0, done: 1, awaiting_result: 2, graded: 3, excused: 4 } as const;
  const items = [...view.assessments].sort((a, b) => order[a.state] - order[b.state] || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  return (
    <div className="flex flex-col gap-4">
      {view.result.warnings.length > 0 && (
        <Notice tone="warn">
          {view.result.warnings.map((w, i) => (
            <span key={i} className="block">
              {w.kind === "needs_review"
                ? `${w.categoryName} is flagged for review. The grade still counts it as set up here.`
                : w.kind === "over_100"
                  ? "A score is above 100% (bonus). It counts as entered."
                  : "An assessment's category is not in the current syllabus, so it is left out of the grade."}
            </span>
          ))}
        </Notice>
      )}
      {items.length === 0 ? (
        <Empty>No assessments yet. Add upcoming work or past grades below.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium">{a.title}</span>
                  <span className="block text-sm text-text-muted">
                    {a.categoryName} · {shortDate(a.dueDate)}
                    {a.studentDoneAt ? " · Student marked done" : ""}
                  </span>
                </span>
                <StateBadge state={a.state} label={a.state === "graded" ? percent(((a.scoreEarned as number) / a.scorePossible) * 100) : STATE_LABEL[a.state]} />
              </div>
              {a.openFlag && (
                <Notice tone="warn">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>Student flagged this: &ldquo;{FLAG_LABEL[a.openFlag.reason]}&rdquo;. Fix the score if needed, then mark it resolved.</span>
                    <ActionButton action={resolveFlag.bind(null, a.openFlag.id)} label="Mark resolved" className={small} />
                  </span>
                </Notice>
              )}
              <ActionForm action={saveScore.bind(null, a.id)} labels={{ scoreEarned: "Score", scorePossible: "Out of" }} secondary submitLabel="Save score" className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Score" name={`earned-${a.id}`}>
                    <input id={`earned-${a.id}`} name="scoreEarned" inputMode="decimal" defaultValue={a.scoreEarned ?? ""} className={inputClass} placeholder="Unmarked" />
                  </Field>
                  <Field label="Out of" name={`possible-${a.id}`}>
                    <input id={`possible-${a.id}`} name="scorePossible" inputMode="decimal" defaultValue={a.scorePossible} className={inputClass} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="excused" defaultChecked={a.excused} className="h-4 w-4 accent-accent" />
                  Excused (left out of the grade)
                </label>
              </ActionForm>
              <div>
                <ActionButton action={deleteAssessment.bind(null, a.id)} label="Remove" confirm={`Remove ${a.title}?`} className={small} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {view.categories.length === 0 ? (
        <Notice tone="warn">Add syllabus categories before adding assessments.</Notice>
      ) : (
        <details className="rounded-xl border border-dashed border-border p-3" open={items.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">Add an assessment</summary>
          <div className="pt-3">
            <ActionForm action={addAssessment.bind(null, view.course.id)} labels={ASSESSMENT_LABELS} submitLabel="Add" resetOnSuccess>
              <AssessmentFields categories={view.categories} />
            </ActionForm>
          </div>
        </details>
      )}
      <p className="text-xs text-text-muted">A blank score means unmarked and does not count. 0 is a real zero and counts.</p>
    </div>
  );
}

/** Teacher-pinned priorities and supplemental work, in the order students see them. */
export function TaskManager({ view }: { view: StudentView }) {
  const courseCode = new Map(view.courses.map((c) => [c.course.id, c.course.code]));
  const groups = [
    { title: "School work priorities", tasks: view.schoolTasks },
    { title: "Extra practice (not graded)", tasks: view.supplemental },
  ];
  return (
    <div className="flex flex-col gap-4">
      {view.suggestions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
          <h3 className="text-sm font-semibold">Suggested</h3>
          <p className="text-xs text-text-muted">From the grades and due dates. Only you see these until you add one.</p>
          <ul className="flex flex-col divide-y divide-border">
            {view.suggestions.map((s) => (
              <li key={s.key} className="flex flex-col gap-2 py-2">
                <span>
                  <span className="block font-medium">{s.title}</span>
                  <span className="block text-sm text-text-muted">{s.reason}</span>
                </span>
                <span>
                  <ActionButton action={addSuggestedTask.bind(null, view.student.id, s.key)} label="Add to priorities" className={small} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{g.title}</h3>
          {g.tasks.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {g.tasks.map((t, i) => (
                <li key={t.id} className="flex flex-col gap-2 py-2">
                  <span>
                    <span className="block font-medium">
                      {t.pinned && <span className="mr-1 text-accent">Pinned:</span>}
                      {t.title}
                    </span>
                    <span className="block text-sm text-text-muted">
                      {[t.courseId ? courseCode.get(t.courseId) : "Any course", t.reason].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <ActionButton action={setTaskPinned.bind(null, t.id, !t.pinned)} label={t.pinned ? "Unpin" : "Pin"} className={small} />
                    {i > 0 && <ActionButton action={moveTask.bind(null, t.id, "up")} label="Move up" className={small} />}
                    {i < g.tasks.length - 1 && <ActionButton action={moveTask.bind(null, t.id, "down")} label="Move down" className={small} />}
                    <ActionButton action={deleteTask.bind(null, t.id)} label="Remove" confirm={`Remove ${t.title}?`} className={small} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <details className="rounded-xl border border-dashed border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Add a priority or extra practice</summary>
        <div className="pt-3">
          <ActionForm action={addTask.bind(null, view.student.id)} labels={TASK_LABELS} submitLabel="Add" resetOnSuccess>
            <TaskFields courses={view.courses.map((c) => c.course)} />
          </ActionForm>
        </div>
      </details>
    </div>
  );
}

/** Open grade flags from the student, oldest first (ADR 0025). */
export function FlagList({ view }: { view: StudentView }) {
  const flagged = view.flagged.flatMap((a) => (a.openFlag ? [{ a, flag: a.openFlag }] : []));
  if (flagged.length === 0) return null;
  return (
    <Card title={`Flags from ${view.student.firstName}`}>
      <ul className="flex flex-col divide-y divide-border">
        {flagged.map(({ a, flag }) => (
          <li key={flag.id} className="flex flex-col gap-2 py-2">
            <span>
              <Link className="block font-medium underline underline-offset-2" href={`/students/${view.student.id}/courses/${a.courseId}`}>
                {a.courseCode} · {a.title}
              </Link>
              <span className="block text-sm text-text-muted">
                &ldquo;{FLAG_LABEL[flag.reason]}&rdquo; · {stamp(flag.createdAt)}
              </span>
            </span>
            <span>
              <ActionButton action={resolveFlag.bind(null, flag.id)} label="Mark resolved" className={small} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The invite (ADR 0016): a prefilled email from the teacher, plus the text to copy. */
export function InvitePanel({ view, orgName }: { view: StudentView; orgName: string }) {
  const s = view.student;
  if (!s.publishedAt) return null;
  if (s.userId) {
    return (
      <Card title="Invite">
        <Notice tone="ok">{s.firstName} has signed in.</Notice>
      </Card>
    );
  }
  const subject = `Your ${orgName} student tracker`;
  const body = `Hi ${s.firstName},\n\nYour student tracker is ready. Open ${TRACKER_URL} and sign in with this email address (${s.email}). We email you a sign-in link, so there is no password.\n\n${orgName}`;
  return (
    <Card title="Invite">
      <p className="text-sm">
        {s.firstName} has not signed in yet. Send this from your email. They sign in with <strong>{s.email}</strong>.
      </p>
      <a className={secondaryButtonClass} href={`mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
        Open invite email
      </a>
      <textarea readOnly rows={5} className={`${inputClass} text-sm`} defaultValue={body} aria-label="Invite text to copy" />
      <p className="text-xs text-text-muted">
        Or send them to <a className={linkClass} href={TRACKER_URL}>{TRACKER_URL}</a>.
      </p>
    </Card>
  );
}
