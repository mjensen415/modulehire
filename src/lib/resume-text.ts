// Text out of an uploaded resume (PDF, DOCX or TXT). Shared by /api/upload-resume and the eval
// suite (scripts/eval), so the eval exercises exactly what users get.

export const UNREADABLE_TEXT_MESSAGE =
  "We couldn't read any text in this file. If it's a scan or a photo, upload the original Word or PDF instead."

// Fewer non-space characters than this means there's no real text layer (a scan's stray page
// numbers, say), not a resume.
const MIN_TEXT_CHARS = 50

export async function extractResumeText(buffer: Buffer, filename: string, mimeType = ''): Promise<string> {
  const name = filename.toLowerCase()
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }
  if (mimeType === 'text/plain' || name.endsWith('.txt')) return buffer.toString('utf-8')
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

/** True when the extracted text is too thin to be a resume (e.g. an image-only scan). */
export function isUnreadable(text: string): boolean {
  return text.replace(/\s+/g, '').length < MIN_TEXT_CHARS
}
