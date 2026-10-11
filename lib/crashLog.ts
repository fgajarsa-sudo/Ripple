import { File, Paths } from 'expo-file-system';

// Fresh-install crashes happening inside expo-updates' error-recovery window show up in
// device crash logs only as an opaque native re-throw with no JS message attached — the
// original JS error has no way to reach us. This writes that original error to disk the
// moment it's caught, synchronously (no await — a crash can follow within milliseconds),
// so the next launch can read it back and actually show us what happened.
function logFile(): File {
  return new File(Paths.document, 'last-fatal-error.txt');
}

export function recordFatalError(error: unknown): void {
  try {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
    const file = logFile();
    if (file.exists) file.delete();
    file.create();
    file.write(`[${new Date().toISOString()}]\n${message}`);
  } catch {
    // Best-effort diagnostic only — must never itself throw inside a global error handler.
  }
}

export function consumeFatalErrorLog(): string | null {
  try {
    const file = logFile();
    if (!file.exists) return null;
    const text = file.textSync();
    file.delete();
    return text;
  } catch {
    return null;
  }
}
