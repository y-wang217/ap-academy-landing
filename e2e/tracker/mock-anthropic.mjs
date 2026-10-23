// Stand-in for the Anthropic Messages API, for the AI draft flow. Reads the
// student refs the tracker sent and answers with a fixed structured draft:
// a score for "Lab report", a new "Quiz 2" in Assignments, an uncertain new
// priority, and one line it could not place. GET /__last returns the last
// request body, so the flow can check what left the app.
// Iris classify calls (REQ-43) are recognised by the classifier system prompt's
// first line and answered by a word in the message: "twice" is a billing
// question flagged money_dispute, "cancel" a cancellation, anything else a
// general question, all at 0.95 or more. They never replace /__last.
// Iris draft calls (REQ-44) are recognised by the draft system prompt's first line: a message with "forfeit"
// gets a body that breaks the draft rules (a clock time and "forfeited"); anything else a clean body.
// REQ-47: "move" classifies as a reschedule request; a reschedule_offer prompt (it says how many make-up times
// are offered) gets a body with the [OPTIONS] line, which the tracker fills in.
import http from "node:http";

const IRIS_FIRST_LINE = "You are Iris, the inbox classifier for AP Academy, a tutoring business.";
const DRAFT_FIRST_LINE = "You draft one email reply for Charlie, who runs AP Academy, a tutoring business.";

function draftAnswer(user) {
  const body = (/<message>\n([\s\S]*)\n<\/message>/.exec(user)?.[1] ?? "").toLowerCase();
  if (user.includes("Make-up times offered:")) {
    return { body: "Hi,\n\nWe can move the class. These times work:\n[OPTIONS]\nLet me know which suits you and I will confirm it.", needs_charlie: false, reason: "" };
  }
  if (body.includes("move")) return { body: "Hi,\n\nNo problem. Charlie will send options.", needs_charlie: false, reason: "" };
  return body.includes("forfeit")
    ? { body: "Hi,\n\nThat class is forfeited. Come at 5:30 instead.", needs_charlie: false, reason: "" }
    : { body: "Hi,\n\nThanks for letting me know. I will follow up with some options soon.", needs_charlie: false, reason: "" };
}

function irisAnswer(user) {
  const body = (/<message>\n([\s\S]*)\n<\/message>/.exec(user)?.[1] ?? "").toLowerCase();
  const pick = body.includes("twice")
    ? { intents: ["billing_question"], primary: "billing_question", confidence: 0.97, flags: ["money_dispute"] }
    : body.includes("cancel")
      ? { intents: ["cancellation"], primary: "cancellation", confidence: 0.95, flags: [] }
      : body.includes("move")
        ? { intents: ["reschedule_request"], primary: "reschedule_request", confidence: 0.95, flags: [] }
        : { intents: ["general_question"], primary: "general_question", confidence: 0.95, flags: [] };
  return { ...pick, child_name: "", summary: "A synthetic mock summary." };
}

let last = null;

// Text and choice fields say "not given" with "", as the wire schema does.
const blank = {
  ref: "", new_ref: "", course: "", category: "",
  school: "", program: "", application_year: null, target_six_avg: null, benchmark_note: "",
  code: "", name: "", term: "", status: "", in_six_plan: null, target_grade: null,
  weight: null, aggregation_method: "", needs_review: null,
  title: "", assessment_kind: "", due_date: "", held_on: "", score_earned: null, score_possible: null, excused: null,
  kind: "", reason: "", pinned: null, certain: true, check: "", source: "",
};

const server = http.createServer((req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/__last") return send(200, last ?? {});
  if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) return send(404, { type: "error", error: { type: "not_found_error", message: "not mocked" } });

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const request = JSON.parse(raw);
    const system = typeof request.system === "string" ? request.system : (request.system ?? []).map((b) => b.text ?? "").join("");
    const firstLine = system.split("\n")[0];
    if (firstLine === IRIS_FIRST_LINE || firstLine === DRAFT_FIRST_LINE) {
      const content = request.messages[0].content;
      const user = typeof content === "string" ? content : content.map((b) => b.text ?? "").join("");
      return send(200, {
        id: "msg_mock_iris", type: "message", role: "assistant", model: request.model,
        content: [{ type: "text", text: JSON.stringify(firstLine === IRIS_FIRST_LINE ? irisAnswer(user) : draftAnswer(user)) }],
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 300, output_tokens: 40 },
      });
    }
    last = request;
    const user = last.messages[0].content;
    const text = typeof user === "string" ? user : user.map((b) => b.text ?? "").join("");
    const start = text.indexOf("{");
    const end = text.indexOf("\n\n", start);
    const student = JSON.parse(text.slice(start, end === -1 ? undefined : end));
    const course = student.courses.find((c) => c.assessments.some((a) => a.title === "Lab report")) ?? student.courses[0];
    const lab = course?.assessments.find((a) => a.title === "Lab report");
    const assignments = course?.categories.find((c) => c.name === "Assignments");
    const answer = {
      items: [
        { ...blank, op: "update_assessment", ref: lab?.ref ?? "", score_earned: 18, score_possible: 20, source: "Lab report 18/20" },
        { ...blank, op: "add_assessment", course: course?.ref ?? "", category: assignments?.ref ?? "", title: "Quiz 2", score_earned: 9, score_possible: 10, source: "Quiz 2 9/10" },
        { ...blank, op: "add_task", course: course?.ref ?? "", title: "Review unit 3 before the test", certain: false, check: "Is this school work?", source: "maybe review unit 3" },
      ],
      unmatched: ["Field trip money due Friday"],
    };
    send(200, {
      id: "msg_mock", type: "message", role: "assistant", model: last.model,
      content: [{ type: "text", text: JSON.stringify(answer) }],
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 500, output_tokens: 120 },
    });
  });
});
server.listen(54332, "127.0.0.1", () => console.log("mock anthropic on :54332"));
