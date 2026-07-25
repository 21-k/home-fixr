// Shared constants for the private `cvs` Storage bucket
// (created in supabase/migrations/0005_cv_attachments.sql).
//
// Keep these in sync with the bucket's file_size_limit / allowed_mime_types —
// the bucket is the real enforcement point; these give the browser a fast,
// friendly failure before a pointless 5MB upload.

export const CV_BUCKET = "cvs";

export const CV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const CV_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
] as const;

/** `accept` attribute for the file input. */
export const CV_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

/** How long a generated download link stays valid. */
export const CV_SIGNED_URL_SECONDS = 60 * 5;

/** Human-readable rejection reason, or null if the file is acceptable. */
export function checkCvFile(file: File): string | null {
  if (file.size > CV_MAX_BYTES) {
    return "That file is over 5MB. Try compressing it or exporting a smaller PDF.";
  }
  if (!(CV_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Attach a PDF, Word document, or image.";
  }
  return null;
}

// ================================================================
// Message attachments — private `message-attachments` bucket
// (created in supabase/migrations/0007_message_attachments.sql).
// ================================================================

export const MESSAGE_BUCKET = "message-attachments";

export const MESSAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const MESSAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const MESSAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.gif,.pdf,.doc,.docx";

export function checkMessageFile(file: File): string | null {
  if (file.size > MESSAGE_MAX_BYTES) {
    return "That file is over 10MB. Try a smaller photo or a compressed PDF.";
  }
  if (!(MESSAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "You can send images, PDFs, and Word documents.";
  }
  return null;
}

/** Images render inline in the thread; everything else becomes a download. */
export function isImageType(mime: string | null): boolean {
  return Boolean(mime?.startsWith("image/"));
}
