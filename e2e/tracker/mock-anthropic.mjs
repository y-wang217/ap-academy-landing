// Stand-in for the Anthropic Messages API, for the AI paste flow. Reads the
// course refs the tracker sent and answers with a fixed structured draft:
// a score for "Lab report", a new "Quiz 2" in Assignments, and one line it
// could not match. GET /__last returns the last request body, so the flow can
// check what left the app.
import http from "node:http";

let last = null;

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
    const course = JSON.parse(text.slice(text.indexOf("{"), text.indexOf("\n\nThe pasted text:")));
    const lab = course.assessments.find((a) => a.title === "Lab report");
    const assignments = course.categories.find((c) => c.name === "Assignments");
    const answer = {
      items: [
        { op: "set_score", assessment: lab?.ref ?? null, category: null, title: null, due_date: null, score_earned: 18, score_possible: 20, excused: null, source: "Lab report 18/20" },
        { op: "add_assessment", assessment: null, category: assignments?.ref ?? null, title: "Quiz 2", due_date: null, score_earned: 9, score_possible: 10, excused: null, source: "Quiz 2 9/10" },
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
