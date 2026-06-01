// ════════════════════════════════════════
// config.js — Configuração central (limites, extensões, e-mail)
// Todos os valores são sobrescritíveis via variáveis de ambiente VITE_*
// ════════════════════════════════════════

export const CONFIG = {
  // Tentativas de login por janela de tempo antes de disparar alerta de brute force
  LOGIN_MAX_ATTEMPTS: Number(import.meta.env.VITE_LOGIN_MAX_ATTEMPTS) || 5,

  // Janela de tempo para contagem de tentativas de login (ms) — padrão 15 min
  LOGIN_WINDOW_MS: Number(import.meta.env.VITE_LOGIN_WINDOW_MS) || 15 * 60 * 1000,

  // Falhas de credencial antes de disparar alerta de erro repetido
  LOGIN_MAX_FAILS: Number(import.meta.env.VITE_LOGIN_MAX_FAILS) || 5,

  // Falhas de descriptografia antes de banir o usuário
  DECRYPT_MAX_FAILS: Number(import.meta.env.VITE_DECRYPT_MAX_FAILS) || 3,

  // Allowlist de extensões permitidas para upload (com ponto)
  ALLOWED_EXTENSIONS: (
    import.meta.env.VITE_ALLOWED_EXTENSIONS || ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
  ).split(","),

  // E-mail do administrador para receber notificações
  ADMIN_EMAIL: import.meta.env.VITE_ADMIN_EMAIL || "jodolar646@mtupu.com",

  // URL do backend Flask (criptografia Python)
  API_URL: import.meta.env.VITE_API_URL || "http://localhost:5000",
};
