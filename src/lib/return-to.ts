const KEY = 'rentmaikar:return-to';

/** Routes that should never be restored as a post-login destination. */
const EXCLUDED = ['/auth', '/login', '/signin', '/signup', '/reset-password'];

export function isRestorablePath(path?: string | null): path is string {
  if (!path || !path.startsWith('/')) return false;
  return !EXCLUDED.some((p) => path === p || path.startsWith(`${p}?`) || path.startsWith(`${p}/`));
}

/** Remember where the user was headed before being sent to the auth screen. */
export function rememberReturnTo(path: string) {
  if (!isRestorablePath(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* storage unavailable */
  }
}

/** Read (and keep) the remembered destination; survives a refresh of /auth. */
export function readReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return isRestorablePath(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearReturnTo() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
