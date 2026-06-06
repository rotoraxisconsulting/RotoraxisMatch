import { supabase } from './supabase';

const BUCKET = 'technician-documents';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME: Record<string, string> = {
  pdf:  'application/pdf',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
};

/** Infer MIME type from filename extension when picker doesn't provide it. */
export function mimeFromName(name: string): string | undefined {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_MIME[ext];
}

/**
 * Returns an error string if the file fails validation, null if it's OK.
 * @param mimeType  MIME type reported by the picker (may be undefined on Android)
 * @param name      Original file name — used as fallback for MIME detection
 * @param sizeBytes File size in bytes (may be undefined)
 */
export function validateDocumentFile(
  mimeType: string | undefined,
  name: string,
  sizeBytes: number | undefined,
): string | null {
  const resolved = mimeType?.toLowerCase() ?? mimeFromName(name);
  if (!resolved || !Object.values(ALLOWED_MIME).includes(resolved)) {
    return 'Only PDF, JPG, PNG, or WEBP files are allowed.';
  }
  if (sizeBytes !== undefined && sizeBytes > MAX_SIZE_BYTES) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    return `File is too large (${mb} MB). Maximum is 5 MB.`;
  }
  return null;
}

/**
 * Uploads a document file to Supabase Storage.
 * Path: {technicianId}/{timestamp+random}.{ext}
 */
export async function uploadDocumentToStorage(
  uri: string,
  mimeType: string | undefined,
  name: string,
  technicianId: string,
): Promise<{ storagePath: string; error: string | null }> {
  try {
    const ext = name.split('.').pop()?.toLowerCase() ?? 'bin';
    const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const storagePath = `${technicianId}/${uid}.${ext}`;
    const resolvedMime = mimeType ?? mimeFromName(name) ?? 'application/octet-stream';

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { contentType: resolvedMime, upsert: false });

    if (error) return { storagePath: '', error: error.message };
    return { storagePath, error: null };
  } catch (err) {
    return {
      storagePath: '',
      error: err instanceof Error ? err.message : 'Upload failed.',
    };
  }
}

/**
 * Creates a short-lived signed URL for a private document.
 * Default expiry: 120 seconds — enough to open the file.
 */
export async function getDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 120,
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return { url: null, error: error.message };
  return { url: data.signedUrl, error: null };
}
