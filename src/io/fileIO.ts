/**
 * Browser file-picker and download helpers for Apollo HD-map IO. Pure
 * DOM utilities — no React, no store dependencies, easy to unit-test
 * by mocking `document.createElement`.
 */

/** Open a hidden `<input type="file">` and resolve with the selected File, or null if cancelled. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    let settled = false;
    const settle = (value: File | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      try {
        input.remove();
      } catch {
        /* ignore */
      }
    };

    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      settle(file);
    });
    // The browser does not always fire `change` when the dialog is cancelled,
    // so listen for `cancel` (Chromium ≥113, modern Safari/Firefox) and treat
    // a window-focus event without a file as a cancel.
    input.addEventListener('cancel', () => settle(null));
    window.addEventListener(
      'focus',
      () => {
        // Give the browser a tick to deliver the change event first.
        setTimeout(() => settle(null), 200);
      },
      { once: true },
    );

    document.body.appendChild(input);
    input.click();
  });
}

/** Read a Blob/File as Uint8Array. */
export async function readFileAsBytes(file: Blob): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

/** Read a Blob/File as UTF-8 text. */
export function readFileAsText(file: Blob): Promise<string> {
  return file.text();
}

/** Trigger a browser download for a given Blob using a synthetic anchor click. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Defer revoke so the download has time to start.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
