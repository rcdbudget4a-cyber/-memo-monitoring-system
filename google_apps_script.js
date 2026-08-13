/**
 * Google Apps Script for PRO 4A RCD Memo Monitoring System
 * Automatically appends memo entries to Google Sheets, uploads files to Google Drive,
 * and deletes rows from Google Sheets (handles exact ID & base control number suffix matching).
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    var data = {};

    // 1. Parse JSON POST body if present
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {}
    }

    // 2. Supplement with GET/URL parameters if present
    if (e && e.parameter) {
      if (e.parameter.action) data.action = e.parameter.action;
      if (e.parameter.id) data.id = e.parameter.id;
      if (e.parameter.ids) {
        try {
          data.ids = JSON.parse(e.parameter.ids);
        } catch (err) {
          data.ids = String(e.parameter.ids).split(",");
        }
      }
      if (e.parameter.fileData) data.fileData = e.parameter.fileData;
      if (e.parameter.filename) data.filename = e.parameter.filename;
      if (e.parameter.mimeType) data.mimeType = e.parameter.mimeType;
      if (e.parameter.memo) {
        try { data.memo = JSON.parse(e.parameter.memo); } catch (err) {}
      }
    }

    var TARGET_FOLDER_ID = "1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh";

    // Action A: Upload File to Google Drive
    if (data.fileData && data.filename) {
      var folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
      var bytes = Utilities.base64Decode(data.fileData);
      var blob = Utilities.newBlob(bytes, data.mimeType || "application/pdf", data.filename);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      return ContentService.createTextOutput(JSON.stringify({
        result: "success",
        fileUrl: file.getUrl(),
        fileId: file.getId()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Action B: Append Row to Google Sheet ("Memo Logbook")
    if (data.action === "appendMemo" && data.memo) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("Memo Logbook") || ss.getSheets()[0];
      var m = data.memo;
      var lastRow = sheet.getLastRow();

      sheet.appendRow([
        lastRow,                           // Column A: No.
        m.id || "",                        // Column B: Control Ref ID
        m.dateLogged || "",                // Column C: Date Logged
        m.time || "",                      // Column D: Time
        m.receivedBy || "",                // Column E: Input / Received By
        m.originatingOffice || "",         // Column F: Originating Office
        m.subject || "",                   // Column G: Subject / Title of Memo
        m.actionRequired || "",            // Column H: Action Required
        m.remarksStatus || "",             // Column I: Remarks / Status
        m.transmittedOffice || "",         // Column J: Transmitted Office
        m.dateReceived || "",              // Column K: Date Received
        "Inside RCD",                      // Column L: RCD Location Status
        m.driveLink || ""                  // Column M: Google Drive Link
      ]);

      return ContentService.createTextOutput(JSON.stringify({
        result: "success",
        rowAdded: lastRow + 1
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Action C: Delete Row(s) from Google Sheet ("Memo Logbook")
    if ((data.action === "deleteMemo" || data.action === "emptyRecycleBin") && (data.id || data.ids)) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("Memo Logbook") || ss.getSheets()[0];
      var dataRange = sheet.getDataRange();
      var values = dataRange.getValues();

      var rawTargetIds = {};
      var baseTargetIds = {};

      var getBaseId = function(idStr) {
        if (!idStr) return "";
        var parts = String(idStr).trim().toUpperCase().split('-');
        if (parts.length > 3) {
          return parts.slice(0, 3).join('-');
        }
        return parts.join('-');
      };

      var addIdToTargets = function(rawId) {
        if (!rawId) return;
        var clean = String(rawId).trim().toUpperCase();
        rawTargetIds[clean] = true;
        var base = getBaseId(clean);
        if (base) baseTargetIds[base] = true;
      };

      if (data.ids && Array.isArray(data.ids)) {
        data.ids.forEach(addIdToTargets);
      }
      if (data.id) {
        addIdToTargets(data.id);
      }

      var deletedCount = 0;
      // Loop backwards from end of sheet to row 1 so row deletions don't shift indices
      for (var i = values.length - 1; i >= 1; i--) {
        var cellId = String(values[i][1]).trim().toUpperCase(); // Column B: Control Ref ID
        var cellBaseId = getBaseId(cellId);

        if (rawTargetIds[cellId] || baseTargetIds[cellId] || (cellBaseId && baseTargetIds[cellBaseId])) {
          sheet.deleteRow(i + 1);
          deletedCount++;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        result: "success",
        deletedCount: deletedCount
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: "ignored",
      message: "No recognized action or parameters."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
