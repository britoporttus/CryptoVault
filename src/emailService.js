// ════════════════════════════════════════
// emailService.js — Envio de e-mails via EmailJS (async + retry)
// ════════════════════════════════════════

import emailjs from "@emailjs/browser";

const SERVICE_ID   = import.meta.env.VITE_EMAILJS_SERVICE_ID        || "";
const PUBLIC_KEY   = import.meta.env.VITE_EMAILJS_PUBLIC_KEY        || "";
const T_BAN        = import.meta.env.VITE_EMAILJS_TEMPLATE_BAN      || "";
const T_SUSPICIOUS = import.meta.env.VITE_EMAILJS_TEMPLATE_SUSPICIOUS || "";
const T_UNBAN      = import.meta.env.VITE_EMAILJS_TEMPLATE_UNBAN    || "";
const ADMIN_EMAIL  = import.meta.env.VITE_ADMIN_EMAIL               || "jodolar646@mtupu.com";

const MAX_RETRIES = 2;
const RETRY_DELAY = 3000;

function isConfigured() {
  return Boolean(SERVICE_ID && PUBLIC_KEY);
}

async function sendWithRetry(templateId, params, retries = MAX_RETRIES) {
  if (!isConfigured() || !templateId) {
    console.warn("[EmailService] Não configurado — e-mail não enviado.", { templateId, params });
    return;
  }
  try {
    await emailjs.send(SERVICE_ID, templateId, params, { publicKey: PUBLIC_KEY });
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      return sendWithRetry(templateId, params, retries - 1);
    }
    console.error("[EmailService] Falha após retries:", err);
    throw err;
  }
}

// Notifica admin quando um usuário é banido
export function notifyAdminBan(bannedUser, trigger, timestamp) {
  return sendWithRetry(T_BAN, {
    to_email:    ADMIN_EMAIL,
    user_name:   bannedUser.name,
    user_email:  bannedUser.email,
    trigger,
    timestamp,
    review_link: window.location.origin,
  });
}

const SUSPICIOUS_LABELS = {
  suspicious_ratelimit: "Rate limit / força bruta no login",
  suspicious_cred:      "Erros repetidos de credencial",
  suspicious_file:      "Upload de arquivo com extensão proibida",
};

// Notifica admin quando atividade suspeita é detectada
export function notifyAdminSuspicious(type, detail, timestamp) {
  return sendWithRetry(T_SUSPICIOUS, {
    to_email:      ADMIN_EMAIL,
    activity_type: SUSPICIOUS_LABELS[type] || type,
    detail,
    timestamp,
  });
}

// Notifica o usuário que foi desbanido
export function notifyUserUnban(user, adminName, reason, timestamp) {
  return sendWithRetry(T_UNBAN, {
    to_email:   user.email,
    user_name:  user.name,
    admin_name: adminName,
    reason:     reason || "Sem motivo especificado",
    timestamp,
  });
}
