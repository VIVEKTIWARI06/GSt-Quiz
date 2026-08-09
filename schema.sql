-- ============================================================
-- GST Quiz Platform — D1 Schema
-- Run with: wrangler d1 execute gst-quiz-db --file=./schema.sql --remote
-- ============================================================

DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS courses;

-- One row per course/question-bank (e.g. "Basic GST", "GST Returns Filing", "Advanced GST")
CREATE TABLE courses (
  id            TEXT PRIMARY KEY,        -- slug, e.g. 'basic-gst'
  name          TEXT NOT NULL,           -- 'Basic GST Certification'
  question_count INTEGER NOT NULL,       -- how many Qs to serve per attempt: 100 / 50 / 30
  pass_percent  INTEGER NOT NULL DEFAULT 60,
  time_limit_min INTEGER NOT NULL DEFAULT 60,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Question bank. Each course can have more questions than question_count —
-- the API randomly samples question_count of them per attempt.
CREATE TABLE questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     TEXT NOT NULL REFERENCES courses(id),
  question_text TEXT NOT NULL,
  option_a      TEXT NOT NULL,
  option_b      TEXT NOT NULL,
  option_c      TEXT NOT NULL,
  option_d      TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_questions_course ON questions(course_id);

-- One row per unique student (identified by email, can retake different courses)
CREATE TABLE students (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  mobile        TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email)
);
CREATE INDEX idx_students_email ON students(email);

-- OTP codes for email verification (short-lived)
CREATE TABLE otp_codes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL,
  code          TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  consumed      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_otp_email ON otp_codes(email);

-- One row per quiz attempt
CREATE TABLE attempts (
  id            TEXT PRIMARY KEY,        -- uuid, doubles as session token
  student_id    INTEGER NOT NULL REFERENCES students(id),
  course_id     TEXT NOT NULL REFERENCES courses(id),
  question_ids  TEXT NOT NULL,           -- JSON array of question ids served, in order
  status        TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | submitted
  score         INTEGER,
  total         INTEGER,
  percent       REAL,
  passed        INTEGER,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at  TEXT,
  certificate_sent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_attempts_student ON attempts(student_id);

-- Autosaved answers per attempt (also used for scoring)
CREATE TABLE answers (
  attempt_id    TEXT NOT NULL REFERENCES attempts(id),
  question_id   INTEGER NOT NULL REFERENCES questions(id),
  selected_option TEXT CHECK (selected_option IN ('A','B','C','D')),
  PRIMARY KEY (attempt_id, question_id)
);

-- ---- Seed courses (edit / add as many as you like) ----
INSERT INTO courses (id, name, question_count, pass_percent, time_limit_min) VALUES
  ('basic-gst', 'Basic GST Certification', 30, 60, 30),
  ('gst-returns', 'GST Returns Filing', 50, 60, 45),
  ('advanced-gst', 'Advanced GST Practitioner', 100, 60, 90);
