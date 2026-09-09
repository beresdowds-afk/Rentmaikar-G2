const RETURN_TO_KEY = 'rentmaikar_return_to';

export function isRestorablePath(path?: string | null): boolean {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  if (trimmed === '/auth' || trimmed.startsWith('/auth?') || trimmed.startsWith('/login')) {
    return false;
  }
  return true;
}

export function rememberReturnTo(path: string): void {
  if (typeof window === 'undefined') return;
  if (!isRestorablePath(path)) return;
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    // Ignore storage failure
  }
}

export function readReturnTo(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = sessionStorage.getItem(RETURN_TO_KEY);
    return isRestorablePath(val) ? val : null;
  } catch {
    return null;
  }
}

export function clearReturnTo(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // Ignore storage failure
  }
}
