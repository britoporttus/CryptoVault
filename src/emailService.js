// ════════════════════════════════════════
// emailService.js — Envio de e-mails via EmailJS (async + retry)
// Os e-mails de admin são enviados para o e-mail cadastrado no perfil do admin.
// Os e-mails de usuário são enviados para o e-mail cadastrado no registro.
// ════════════════════════════════════════

import emailjs from "@emailjs/browser";

const SERVICE_ID    = import.meta.env.VITE_EMAILJS_SERVICE_ID            || "";
const PUBLIC_KEY    = import.meta.env.VITE_EMAILJS_PUBLIC_KEY            || "";
const T_BAN_ADMIN   = import.meta.env.VITE_EMAILJS_TEMPLATE_BAN         || ""; // admin recebe: usuário foi banido
const T_BAN_USER    = import.meta.env.VITE_EMAILJS_TEMPLATE_BAN_USER    || ""; // usuário recebe: sua conta foi banida
const T_SUSPICIOUS  = import.meta.env.VITE_EMAILJS_TEMPLATE_SUSPICIOUS  || ""; // admin recebe: atividade suspeita
const T_UNBAN       = import.meta.env.VITE_EMAILJS_TEMPLATE_UNBAN       || ""; // usuário recebe: conta reativada
const FALLBACK_ADMIN = import.meta.env.VITE_ADMIN_EMAIL                 || "jodolar646@mtupu.com";

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

// Envia para todos os e-mails do array (um por chamada, em paralelo)
function sendToMany(templateId, paramsFor) {
  return (emails) =>
    Promise.all(emails.map((email) => sendWithRetry(templateId, paramsFor(email)).catch(console.error)));
}

// ─── Notificações para ADMINS ─────────────────────────────────

// Notifica todos os admins quando um usuário é banido
// adminEmails: string[] — e-mails dos admins cadastrados no sistema
export function notifyAdminBan(bannedUser, trigger, timestamp, adminEmails = []) {
  const targets = adminEmails.length > 0 ? adminEmails : [FALLBACK_ADMIN];
  return sendToMany(T_BAN_ADMIN, (to_email) => ({
    to_email,
    user_name:   bannedUser.name,
    user_email:  bannedUser.email,
    trigger,
    timestamp,
    review_link: window.location.origin,
  }))(targets);
}

const SUSPICIOUS_LABELS = {
  suspicious_ratelimit: "Rate limit / força bruta no login",
  suspicious_cred:      "Erros repetidos de credencial",
  suspicious_file:      "Upload de arquivo com extensão proibida",
};

// Notifica todos os admins quando atividade suspeita é detectada
export function notifyAdminSuspicious(type, detail, timestamp, adminEmails = []) {
  const targets = adminEmails.length > 0 ? adminEmails : [FALLBACK_ADMIN];
  return sendToMany(T_SUSPICIOUS, (to_email) => ({
    to_email,
    activity_type: SUSPICIOUS_LABELS[type] || type,
    detail,
    timestamp,
    review_link: window.location.origin,
  }))(targets);
}

// ─── Notificações para o USUÁRIO AFETADO ─────────────────────

// Notifica o usuário que sua conta foi banida
// Template: to_email, user_name, trigger, timestamp
export function notifyUserBan(user, trigger, timestamp) {
  return sendWithRetry(T_BAN_USER, {
    to_email:  user.email,
    user_name: user.name,
    trigger,
    timestamp,
  });
}

// Notifica o usuário que sua conta foi reativada
// Template: to_email, user_name, admin_name, reason, timestamp
export function notifyUserUnban(user, adminName, reason, timestamp) {
  return sendWithRetry(T_UNBAN, {
    to_email:   user.email,
    user_name:  user.name,
    admin_name: adminName,
    reason:     reason || "Sem motivo especificado",
    timestamp,
  });
}
