import { FoundationModels, type JSONSchema } from 'expo-foundation-models';

// Apple's on-device Foundation Models framework gained image-attachment
// support in iOS 27 — a prompt can carry a photo alongside text, and the
// model can return structured output matching a JSON schema in one call, no
// separate OCR step and no network request. Verified against the actual
// expo-foundation-models source (PromptWithAttachments, respondWithSchema)
// before building this, not assumed from the package name.
export async function isScanAvailable(): Promise<boolean> {
  if (!FoundationModels.isAvailable()) return false;
  try {
    const { features } = await FoundationModels.getFeatures();
    return features.imageAttachments;
  } catch {
    return false;
  }
}

const SYSTEM_PROMPT =
  'You read photos of real-world documents — receipts, invoices, insurance cards, registration slips — and extract the requested fields exactly as printed. If a field is not visible or not present on the document, omit it from your answer rather than guessing a value.';

/**
 * Reads a photo of a document on-device and extracts fields matching
 * `schema`. Returns null — never throws — if on-device AI or image
 * attachments aren't available on this phone/iOS version, or if generation
 * fails for any reason, so callers can silently fall back to manual entry
 * instead of blocking the form.
 */
export async function scanDocument<T>(imageUri: string, instructions: string, schema: JSONSchema): Promise<T | null> {
  if (!(await isScanAvailable())) return null;

  const sessionId = await FoundationModels.createSession(SYSTEM_PROMPT);
  try {
    return await FoundationModels.respondWithSchema<T>(sessionId, { text: instructions, images: [{ uri: imageUri }] }, schema);
  } catch (e) {
    console.error('[receiptScanService] scan failed', e);
    return null;
  } finally {
    await FoundationModels.closeSession(sessionId).catch(() => {});
  }
}
