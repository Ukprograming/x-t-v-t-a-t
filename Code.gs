const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
const SHEET_NAME = "quiz_logs";

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "quiz logger ready" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = parsePayload_(e);
  const sheet = getSheet_();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "timestamp",
      "nickname",
      "quizCode",
      "answerGraph",
      "showMotion",
      "quizContent",
      "firstAnswer",
      "firstConfidence",
      "firstCorrect",
      "retryAnswer",
      "retryConfidence",
      "retryReason",
      "latestCorrect",
      "attemptNumber"
    ]);
  }

  sheet.appendRow([
    payload.timestamp || "",
    payload.nickname || "",
    payload.quizCode || "",
    payload.answerGraph || "",
    payload.showMotion || "",
    payload.quizContent || "",
    payload.firstAnswer || "",
    payload.firstConfidence || "",
    payload.firstCorrect || "",
    payload.retryAnswer || "",
    payload.retryConfidence || "",
    payload.retryReason || "",
    payload.latestCorrect || "",
    payload.attemptNumber || ""
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const existing = spreadsheet.getSheetByName(SHEET_NAME);
  return existing || spreadsheet.insertSheet(SHEET_NAME);
}

function parsePayload_(e) {
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }

  return {};
}
