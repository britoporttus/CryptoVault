// ════════════════════════════════════════
// persistence.js — localStorage helpers
// Persiste users, logs, alerts, files, loginAttempts.
// currentUser e notifications são sempre reiniciados (força re-login por segurança).
// ════════════════════════════════════════

const STORAGE_KEY = "cryptovault_v1";

export function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistState(state) {
  try {
    // eslint-disable-next-line no-unused-vars
    const { currentUser, notifications, ...saveable } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable));
  } catch {
    // Falha silenciosa (ex.: storage cheio)
  }
}
