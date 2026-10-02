const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "interntrack.db"));

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Applied',
  location TEXT DEFAULT '',
  appDate TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  interviewDate TEXT DEFAULT '',
  followupDate TEXT DEFAULT '',
  jobType TEXT DEFAULT 'Internship',
  stipend TEXT DEFAULT '',
  recruiter TEXT DEFAULT '',
  email TEXT DEFAULT '',
  url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  completed TEXT DEFAULT '[]',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const fields = [
  "company", "role", "status", "location", "appDate", "deadline",
  "interviewDate", "followupDate", "jobType", "stipend", "recruiter",
  "email", "url", "notes"
];
const statuses = new Set(["Wishlist", "Applied", "Assessment", "Shortlisted", "Interview", "Offer", "Rejected", "Withdrawn"]);

function clean(body) {
  const out = {};
  for (const f of fields) out[f] = typeof body[f] === "string" ? body[f].trim() : "";
  out.status = statuses.has(out.status) ? out.status : "Applied";
  out.jobType = out.jobType || "Internship";
  return out;
}
function rowToJSON(row) {
  return { ...row, completed: JSON.parse(row.completed || "[]") };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, database: "SQLite" }));
app.get("/api/applications", (_req, res) => {
  const rows = db.prepare("SELECT * FROM applications ORDER BY updatedAt DESC, id DESC").all();
  res.json(rows.map(rowToJSON));
});
app.get("/api/applications/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Application not found" });
  res.json(rowToJSON(row));
});
app.post("/api/applications", (req, res) => {
  const data = clean(req.body || {});
  if (!data.company || !data.role) return res.status(400).json({ error: "Company and role are required." });
  const stmt = db.prepare(`INSERT INTO applications (${fields.join(",")}, updatedAt) VALUES (${fields.map(() => "?").join(",")}, CURRENT_TIMESTAMP)`);
  const result = stmt.run(...fields.map(f => data[f]));
  res.status(201).json(rowToJSON(db.prepare("SELECT * FROM applications WHERE id = ?").get(result.lastInsertRowid)));
});
app.put("/api/applications/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Application not found" });
  const data = clean(req.body || {});
  if (!data.company || !data.role) return res.status(400).json({ error: "Company and role are required." });
  const set = fields.map(f => `${f} = ?`).join(", ");
  db.prepare(`UPDATE applications SET ${set}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(...fields.map(f => data[f]), id);
  res.json(rowToJSON(db.prepare("SELECT * FROM applications WHERE id = ?").get(id)));
});
app.delete("/api/applications/:id", (req, res) => {
  const result = db.prepare("DELETE FROM applications WHERE id = ?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Application not found" });
  res.status(204).end();
});
app.patch("/api/applications/:id/reminders/:key", (req, res) => {
  const id = Number(req.params.id), key = req.params.key;
  if (!["interviewDate", "followupDate", "deadline"].includes(key)) return res.status(400).json({ error: "Invalid reminder type" });
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Application not found" });
  const completed = JSON.parse(row.completed || "[]");
  if (!completed.includes(key)) completed.push(key);
  db.prepare("UPDATE applications SET completed = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(JSON.stringify(completed), id);
  res.json(rowToJSON(db.prepare("SELECT * FROM applications WHERE id = ?").get(id)));
});
app.get("/api/export", (_req, res) => {
  const rows = db.prepare("SELECT * FROM applications ORDER BY id").all().map(rowToJSON);
  res.json({ app: "InternTrack", version: 1, exportedAt: new Date().toISOString(), applications: rows });
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`InternTrack running at http://localhost:${PORT}`));
