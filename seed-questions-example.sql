-- ============================================================
-- EXAMPLE question seed file — copy this pattern for your real 100 questions.
-- Save your real file as seed-questions.sql (gitignored / not shared) and run:
--   wrangler d1 execute gst-quiz-db --file=./seed-questions.sql --remote
--
-- Put questions under whichever course they belong to via course_id.
-- You can freely add MORE questions than a course's question_count —
-- the quiz randomly samples question_count of them per attempt, so
-- students won't all see the same questions in the same order.
-- ============================================================

INSERT INTO questions (course_id, question_text, option_a, option_b, option_c, option_d, correct_option) VALUES
('basic-gst', 'What does GST stand for?', 'Goods and Services Tax', 'General Sales Tax', 'Government Service Tax', 'Gross Sales Tax', 'A'),
('basic-gst', 'GST in India is a ___ based tax.', 'Origin', 'Destination', 'Production', 'Import', 'B'),
('basic-gst', 'Which of these is NOT a component of GST?', 'CGST', 'SGST', 'IGST', 'VGST', 'D'),
('basic-gst', 'Who administers CGST?', 'State Government', 'Central Government', 'Municipal Corporation', 'RBI', 'B'),
('basic-gst', 'GSTIN consists of how many digits?', '10', '12', '15', '18', 'C'),

('gst-returns', 'GSTR-1 is filed for reporting what?', 'Purchases', 'Outward supplies', 'Tax payments', 'Input credit', 'B'),
('gst-returns', 'What is the due date for GSTR-3B typically?', '10th of next month', '15th of next month', '20th of next month', '25th of next month', 'C'),
('gst-returns', 'GSTR-9 is a ___ return.', 'Monthly', 'Quarterly', 'Annual', 'Weekly', 'C'),

('advanced-gst', 'Reverse charge mechanism applies when?', 'Supplier pays tax', 'Recipient pays tax instead of supplier', 'No tax is applicable', 'Government pays tax', 'B'),
('advanced-gst', 'Input Tax Credit cannot be claimed on which of these?', 'Raw materials', 'Motor vehicles for personal use', 'Office equipment', 'Machinery', 'B');

-- Repeat this pattern for all your real questions, split across the three
-- course_id values ('basic-gst', 'gst-returns', 'advanced-gst') or your own
-- course ids added to the courses table.
