/**
 * Validation Module
 * RCD Memorandum Monitoring System (PRO 4A)
 */

class ValidationManager {
  validateMemoForm(data, existingMemos, isEditMode = false) {
    const errors = [];

    if (!data.id || !data.id.trim()) {
      errors.push("Control / Ref No. is required.");
    } else {
      const trimmedId = data.id.trim();
      if (!isEditMode && existingMemos.some(m => m.id.toLowerCase() === trimmedId.toLowerCase() && !m.isDeleted)) {
        errors.push(`Control / Ref No. "${trimmedId}" already exists in logbook.`);
      }
    }

    if (!data.subject || !data.subject.trim()) {
      errors.push("Subject / Title of Memo is required.");
    }

    if (!data.originatingOffice || !data.originatingOffice.trim()) {
      errors.push("Originating Office is required.");
    }

    if (!data.dateLogged || !data.dateLogged.trim()) {
      errors.push("Date Logged/Received is required.");
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  validateFileUpload(file) {
    if (!file) return { isValid: true };
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExts = ["pdf", "jpg", "jpeg", "png", "webp"];

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      return {
        isValid: false,
        error: "Invalid file type. Only PDF, JPG, and PNG files are allowed."
      };
    }

    if (file.size > 25 * 1024 * 1024) { // 25MB limit
      return {
        isValid: false,
        error: "File size exceeds 25MB maximum limit."
      };
    }

    return { isValid: true };
  }
}

window.validationManager = new ValidationManager();
