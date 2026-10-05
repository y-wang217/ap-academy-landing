// Stand-in for the Anthropic Messages API, for the AI draft flow. Reads the
// student refs the tracker sent and answers with a fixed structured draft:
// a score for "Lab report", a new "Quiz 2" in Assignments, an uncertain new
// priority, and one line it could not place. GET /__last returns the last
// request body, so the flow can check what left the app.
import http from "node:http";

let last = null;

const blank = {
  ref: null, new_ref: null, course: null, category: null,
  school: null, program: null, application_year: null, target_six_avg: null, benchmark_note: null,
  code: null, name: null, term: null, status: null, in_six_plan: null, target_grade: null,
  weight: null, aggregation_method: null, needs_review: null,
  title: null, due_date: null, score_earned: null, score_possible: null, excused: null,
  kind: null, reason: null, pinned: null, certain: true, source: "",
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
    last = JSON.parse(raw);
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
        { ...blank, op: "update_assessment", ref: lab?.ref ?? null, score_earned: 18, score_possible: 20, source: "Lab report 18/20" },
        { ...blank, op: "add_assessment", course: course?.ref ?? null, category: assignments?.ref ?? null, title: "Quiz 2", score_earned: 9, score_possible: 10, source: "Quiz 2 9/10" },
        { ...blank, op: "add_task", course: course?.ref ?? null, title: "Review unit 3 before the test", certain: false, source: "maybe review unit 3" },
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
