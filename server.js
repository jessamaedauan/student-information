const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, "students.json");
const EVENTS_FILE = path.join(__dirname, "events.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

const readJson = (file, fallback = []) => {
  try { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2)); return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error("Read error:", e.message); return fallback; }
};
const saveJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
const readStudents = () => readJson(DATA_FILE);
const readEvents = () => readJson(EVENTS_FILE);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"))
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Upload an image file (JPG, PNG, WEBP, or GIF)."));
  }
});
app.get("/api/health", (_req, res) => res.json({ ok: true, message: "Student Information System API is running." }));
app.get("/api/students", (_req, res) => res.json(readStudents()));
app.post("/api/students", (req, res) => {
  const { studentId, firstName, middleName = "", lastName, email, program, course, year } = req.body;
  if (![studentId, firstName, lastName, email, program, course, year].every(v => String(v || "").trim())) return res.status(400).json({ message: "Please complete all required fields." });
  const students = readStudents();
  if (students.some(s => s.studentId.toLowerCase() === String(studentId).trim().toLowerCase())) return res.status(409).json({ message: "That Student ID is already registered." });
  if (students.some(s => s.email.toLowerCase() === String(email).trim().toLowerCase())) return res.status(409).json({ message: "That email address is already registered." });
  const student = { id: Date.now().toString(), studentId: String(studentId).trim(), firstName: String(firstName).trim(), middleName: String(middleName).trim(), lastName: String(lastName).trim(), email: String(email).trim(), program, course, year, createdAt: new Date().toISOString() };
  students.unshift(student); saveJson(DATA_FILE, students); res.status(201).json(student);
});
app.put("/api/students/:id", (req, res) => {
  const students = readStudents(), index = students.findIndex(s => s.id === req.params.id);
  if (index < 0) return res.status(404).json({ message: "Student not found." });
  const { studentId, firstName, middleName = "", lastName, email, program, course, year } = req.body;
  if (![studentId, firstName, lastName, email, program, course, year].every(v => String(v || "").trim())) return res.status(400).json({ message: "Please complete all required fields." });
  if (students.some((s, i) => i !== index && (s.studentId.toLowerCase() === String(studentId).trim().toLowerCase() || s.email.toLowerCase() === String(email).trim().toLowerCase()))) return res.status(409).json({ message: "Another student already uses that Student ID or email." });
  students[index] = { ...students[index], studentId: String(studentId).trim(), firstName: String(firstName).trim(), middleName: String(middleName).trim(), lastName: String(lastName).trim(), email: String(email).trim(), program, course, year };
  saveJson(DATA_FILE, students); res.json(students[index]);
});
app.delete("/api/students/:id", (req, res) => {
  const students = readStudents(), updated = students.filter(s => s.id !== req.params.id);
  if (updated.length === students.length) return res.status(404).json({ message: "Student not found." });
  saveJson(DATA_FILE, updated); res.json({ message: "Student deleted successfully." });
});
app.get("/api/events", (_req, res) => res.json(readEvents().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))));
app.post("/api/events", (req, res, next) => upload.single("image")(req, res, err => {
  if (err) return res.status(400).json({ message: err.message });
  try {
    const { program, title, description = "", eventDate = "" } = req.body;
    if (!program || !title || !req.file) return res.status(400).json({ message: "Program, event title, and event image are required." });
    const events = readEvents();
    const event = { id: Date.now().toString(), program, title: title.trim(), description: description.trim(), eventDate, image: `/uploads/${req.file.filename}`, createdAt: new Date().toISOString() };
    events.unshift(event); saveJson(EVENTS_FILE, events); res.status(201).json(event);
  } catch (e) { next(e); }
}));
app.delete("/api/events/:id", (req, res) => {
  const events = readEvents(), event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });
  saveJson(EVENTS_FILE, events.filter(e => e.id !== req.params.id));
  if (event.image?.startsWith("/uploads/")) fs.unlink(path.join(UPLOAD_DIR, path.basename(event.image)), () => {});
  res.json({ message: "Event deleted." });
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: "Server error. Please try again." }); });
app.listen(PORT, () => console.log(`Student Information System API running at http://localhost:${PORT}`));
