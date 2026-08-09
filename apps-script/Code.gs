/**
 * GST Quiz — Google Sheet logger.
 *
 * SETUP:
 * 1. Create a new Google Sheet. Add two tabs named exactly: "Leads" and "Results".
 * 2. Leads tab header row (A1:D1): Timestamp | Name | Email | Mobile | Course
 * 3. Results tab header row (A1:H1): Timestamp | Name | Email | Mobile | Course | Score | Percent | Passed
 * 4. Extensions > Apps Script, paste this file in, save.
 * 5. Deploy > New deployment > type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the deployment URL — that's your GAS_WEBHOOK_URL env var in Cloudflare Pages.
 */

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (body.type === "lead") {
    const sheet = ss.getSheetByName("Leads");
    sheet.appendRow([body.timestamp, body.name, body.email, body.mobile, body.course]);
  } else if (body.type === "result") {
    const sheet = ss.getSheetByName("Results");
    sheet.appendRow([
      body.timestamp, body.name, body.email, body.mobile, body.course,
      `${body.score}/${body.total}`, body.percent, body.passed ? "PASS" : "FAIL",
    ]);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
