/**
 * API client for Campaign Brief operations — file upload + brief CRUD.
 */

import type { FileContext, Brief } from '../types';

/**
 * Upload files to the server for text extraction.
 * Returns extracted text content + metadata for each file.
 */
export async function extractFiles(files: File[]): Promise<FileContext[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch('/api/files/extract', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    let msg = `File upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* keep fallback */ }
    throw new Error(msg);
  }

  const data = await res.json();
  return data.files ?? [];
}

/**
 * Fetch existing Brief records from Salesforce.
 */
export async function fetchBriefs(): Promise<{ briefs: Brief[]; totalSize: number }> {
  const res = await fetch('/api/briefs', { credentials: 'include' });
  if (!res.ok) {
    let msg = `Failed to load briefs (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* keep fallback */ }
    throw new Error(msg);
  }
  return res.json();
}
