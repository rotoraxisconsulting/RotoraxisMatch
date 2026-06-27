import { Linking, Platform } from 'react-native';
import { File as FsFile } from 'expo-file-system';
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

    let uploadBody: Blob | Uint8Array;

    if (Platform.OS === 'web') {
      // On web, fetch(uri) works normally — data URIs and blob URLs are supported.
      const response = await fetch(uri);
      uploadBody = await response.blob();
    } else {
      // On iOS/Android, fetch() on a local file:// URI returns an empty body.
      // Use expo-file-system File.arrayBuffer() to read the actual bytes.
      const fsFile = new FsFile(uri);
      const buffer = await fsFile.arrayBuffer();
      uploadBody = new Uint8Array(buffer);
    }

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, uploadBody, { contentType: resolvedMime, upsert: false });

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
 * Opens a document URL in a way that works on iOS Safari.
 *
 * iOS Safari blocks window.open() / navigations that happen after an await because the
 * user gesture is consumed by the first tick. The fix: call window.open('', '_blank')
 * synchronously (before any await), then assign location.href once the URL is ready.
 *
 * Usage pattern in call sites:
 *   const win = openDocumentPreWindow();          // sync — must be first line
 *   const { url, error } = await getDocumentSignedUrl(...);
 *   openDocumentUrl(url, win);
 */
export function openDocumentPreWindow(): Window | null {
  if (Platform.OS !== 'web') return null;
  // @ts-ignore — window is not in RN types but exists on web
  return (typeof window !== 'undefined') ? window.open('', '_blank') : null;
}

export function openDocumentUrl(url: string | null, win: Window | null): void {
  if (!url) {
    win?.close();
    return;
  }
  if (Platform.OS === 'web' && win) {
    win.location.href = url;
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

/**
 * Creates a short-lived signed URL for a private document.
 * Default expiry: 120 seconds — enough to open the file.
 * Pass download=true to add Content-Disposition: attachment (required for iOS Safari downloads).
 */
export async function getDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 120,
  download = false,
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds, download ? { download: true } : undefined);
  if (error) return { url: null, error: error.message };
  return { url: data.signedUrl, error: null };
}
