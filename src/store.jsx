// ════════════════════════════════════════
// store.js — State management & business rules
// ════════════════════════════════════════

import { CONFIG } from "./config.js";

// ─── Password validation ───
export function validatePassword(pw) {
  return [
    { ok: pw.length >= 8,                                            msg: "8+ caracteres" },
    { ok: /[A-Z]/.test(pw),                                          msg: "Maiúscula"      },
    { ok: /[a-z]/.test(pw),                                          msg: "Minúscula"      },
    { ok: /[0-9]/.test(pw),                                          msg: "Número"         },
    { ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw),        msg: "Especial"       },
  ];
}

export function isPasswordValid(pw) {
  return validatePassword(pw).every((c) => c.ok);
}

// ─── Initial state ───
export function createInitialState() {
  return {
    users: [
      {
        id: "admin-1",
        name: "Administrador",
        email: "admin@cryptovault.local",
        role: "admin",
        password: "Admin@123",
        banned: false,
        suspiciousCount: 0,
        createdAt: new Date().toLocaleString("pt-BR"),
        banHistory: [],
        pendingNotifications: [],
      },
    ],
    currentUser: null,
    logs: [],
    alerts: [
      { id: "a1", type: "login_fail",          message: "Falha de autenticação",         active: true  },
      { id: "a2", type: "decrypt_fail",         message: "Descriptografia inválida",      active: true  },
      { id: "a3", type: "upload",               message: "Upload de arquivo",             active: true  },
      { id: "a4", type: "ban",                  message: "Usuário banido",                active: true  },
      { id: "a5", type: "encrypt",              message: "Arquivo criptografado",         active: true  },
      { id: "a6", type: "suspicious_file",      message: "Arquivo suspeito detectado",    active: true  },
      { id: "a7", type: "suspicious_ratelimit", message: "Rate limit de login atingido",  active: true  },
      { id: "a8", type: "suspicious_cred",      message: "Erros repetidos de credencial", active: true  },
    ],
    notifications: [],
    files: [],
    loginAttempts: {}, // { [email]: [{ at: timestamp_ms, failed: boolean }] }
  };
}

// ─── Reducer ───
export function appReducer(state, action) {
  const now    = new Date().toLocaleString("pt-BR");
  const now_ms = Date.now();

  // Helper: prepend a log entry (max 1000)
  function withLog(s, type, detail, userId) {
    const log = {
      id:       `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      detail,
      userId:   userId || s.currentUser?.id || "system",
      userName: userId
        ? s.users.find((u) => u.id === userId)?.name || "?"
        : s.currentUser?.name || "Sistema",
      time: now,
    };
    return { ...s, logs: [log, ...s.logs].slice(0, 1000) };
  }

  // Helper: fire in-app notification if alert type is active
  function withNotification(s, type, detail) {
    const alert = s.alerts.find((a) => a.type === type && a.active);
    if (!alert) return s;
    const notif = {
      id:      `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message: `${alert.message}: ${detail}`,
      time:    now,
      type,
    };
    return { ...s, notifications: [notif, ...s.notifications].slice(0, 200) };
  }

  switch (action.type) {

    // ─── Auth ───
    case "REGISTER": {
      if (state.users.find((u) => u.email === action.user.email)) return state;
      const u = {
        ...action.user,
        id:                   `u-${Date.now()}`,
        role:                 "user",
        banned:               false,
        suspiciousCount:      0,
        createdAt:            now,
        banHistory:           [],
        pendingNotifications: [],
      };
      let s = { ...state, users: [...state.users, u] };
      s = withLog(s, "register", `Novo cadastro: ${u.name} (${u.email})`, u.id);
      return s;
    }

    case "LOGIN": {
      const windowStart   = now_ms - CONFIG.LOGIN_WINDOW_MS;
      const prevAttempts  = state.loginAttempts[action.email] || [];
      const recentAll     = prevAttempts.filter((a) => a.at > windowStart);
      const totalAfter    = recentAll.length + 1;

      let s = state;

      // Detectar rate limit (dispara apenas quando cruza o limiar pela primeira vez)
      if (totalAfter === CONFIG.LOGIN_MAX_ATTEMPTS) {
        s = withLog(
          s, "suspicious_ratelimit",
          `Rate limit: ${totalAfter} tentativas de login em ${CONFIG.LOGIN_WINDOW_MS / 60000}min — e-mail: ${action.email}`
        );
        s = withNotification(s, "suspicious_ratelimit", action.email);
      }

      const user   = state.users.find((u) => u.email === action.email && u.password === action.password);
      const failed = !user;
      const thisAttempt = { at: now_ms, failed };
      const updatedAttempts = {
        ...s.loginAttempts,
        [action.email]: [...recentAll, thisAttempt],
      };

      if (!user) {
        const failedCount = recentAll.filter((a) => a.failed).length + 1;
        // Detectar erros repetidos de credencial (dispara apenas quando cruza o limiar)
        if (failedCount === CONFIG.LOGIN_MAX_FAILS) {
          s = withLog(
            s, "suspicious_cred",
            `Erros repetidos de credencial (${failedCount}/${CONFIG.LOGIN_MAX_FAILS}): ${action.email}`
          );
          s = withNotification(s, "suspicious_cred", action.email);
        }
        s = withLog(s, "login_fail", `Falha de login: ${action.email}`);
        s = withNotification(s, "login_fail", action.email);
        return { ...s, loginAttempts: updatedAttempts };
      }

      if (user.banned) {
        s = withLog(s, "login_fail", `Usuário banido tentou login: ${user.email}`);
        return { ...s, loginAttempts: updatedAttempts };
      }

      // Sucesso: processa notificações pendentes do usuário
      const pending      = user.pendingNotifications || [];
      const updatedUsers = state.users.map((u) =>
        u.id === user.id ? { ...u, pendingNotifications: [] } : u
      );

      s = {
        ...s,
        loginAttempts: updatedAttempts,
        currentUser:   { ...user, pendingNotifications: [] },
        users:         updatedUsers,
      };
      s = withLog(s, "login", `Login: ${user.email}`, user.id);
      if (pending.length > 0) {
        s = { ...s, notifications: [...pending, ...s.notifications].slice(0, 200) };
      }
      return s;
    }

    case "LOGOUT": {
      let s = withLog(state, "logout", `Logout: ${state.currentUser?.email}`);
      return { ...s, currentUser: null };
    }

    // ─── File operations ───
    case "FILE_ENCRYPTED": {
      const file = {
        id:         `f-${Date.now()}`,
        name:       action.fileName,
        userId:     state.currentUser.id,
        userName:   state.currentUser.name,
        time:       now,
        keyPreview: action.keyHex.slice(0, 8) + "..." + action.keyHex.slice(-8),
      };
      let s = { ...state, files: [file, ...state.files] };
      s = withLog(s, "encrypt", `Criptografado: ${action.fileName}`);
      s = withNotification(s, "encrypt", action.fileName);
      s = withNotification(s, "upload", action.fileName);
      return s;
    }

    case "FILE_DECRYPTED": {
      return withLog(state, "decrypt", `Descriptografado: ${action.fileName}`);
    }

    case "DECRYPT_FAILED": {
      const user     = state.users.find((u) => u.id === state.currentUser?.id);
      if (!user) return state;
      const newCount = (user.suspiciousCount || 0) + 1;
      const banned   = newCount >= CONFIG.DECRYPT_MAX_FAILS;

      const banEntry = banned
        ? {
            action:  "ban",
            at:      now,
            trigger: `Múltiplas falhas de descriptografia (${newCount}/${CONFIG.DECRYPT_MAX_FAILS})`,
            by:      "system",
            byName:  "Sistema automático",
            reverted: false,
          }
        : null;

      const updatedUsers = state.users.map((u) =>
        u.id === user.id
          ? {
              ...u,
              suspiciousCount: newCount,
              banned,
              banHistory: banEntry
                ? [...(u.banHistory || []), banEntry]
                : (u.banHistory || []),
            }
          : u
      );

      let s = {
        ...state,
        users:       updatedUsers,
        currentUser: banned ? null : state.currentUser,
      };
      s = withLog(s, "decrypt_fail", `Falha descriptografia (${newCount}/${CONFIG.DECRYPT_MAX_FAILS}): ${action.fileName}`);
      s = withNotification(s, "decrypt_fail", `${user.email} (${newCount}/${CONFIG.DECRYPT_MAX_FAILS})`);
      if (banned) {
        // userId passado explicitamente para não perder a referência após currentUser = null
        s = withLog(s, "ban", `Usuário banido por atividade suspeita: ${user.email}`, user.id);
        s = withNotification(s, "ban", user.email);
      }
      return s;
    }

    case "SUSPICIOUS_FILE": {
      let s = withLog(
        state, "suspicious_file",
        `Arquivo proibido: ${action.fileName} — usuário: ${state.currentUser?.email || "anônimo"}`
      );
      s = withNotification(s, "suspicious_file", action.fileName);
      return s;
    }

    // ─── Admin ───
    case "TOGGLE_ALERT": {
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.id ? { ...a, active: !a.active } : a
        ),
      };
    }

    case "ADD_ALERT": {
      const newAlert = {
        id:      `a-${Date.now()}`,
        type:    action.alertType,
        message: action.message,
        active:  true,
      };
      return { ...state, alerts: [...state.alerts, newAlert] };
    }

    case "UNBAN_USER": {
      const targetUser = state.users.find((u) => u.id === action.userId);
      if (!targetUser) return state;

      // Marca o ban mais recente não-revertido como revertido (audit trail)
      const rawHistory  = targetUser.banHistory || [];
      const lastBanIdx  = rawHistory.reduce(
        (acc, e, i) => (e.action === "ban" && !e.reverted ? i : acc), -1
      );
      const markedHistory = rawHistory.map((entry, i) =>
        i === lastBanIdx
          ? { ...entry, reverted: true, revertedBy: action.adminId, revertedAt: now }
          : entry
      );

      const unbanEntry = {
        action:    "unban",
        at:        now,
        adminId:   action.adminId,
        adminName: action.adminName,
        reason:    action.reason || null,
      };

      // Notificação in-app que o usuário verá no próximo login
      const pendingNotif = {
        id:      `pn-${Date.now()}`,
        message: `Sua conta foi reativada por ${action.adminName}${action.reason ? ` — Motivo: ${action.reason}` : ""}. Acesso restaurado em ${now}.`,
        time:    now,
        type:    "unban",
      };

      const updatedUsers = state.users.map((u) =>
        u.id === action.userId
          ? {
              ...u,
              banned:               false,
              suspiciousCount:      0,
              banHistory:           [...markedHistory, unbanEntry],
              pendingNotifications: [...(u.pendingNotifications || []), pendingNotif],
            }
          : u
      );

      let s = { ...state, users: updatedUsers };
      s = withLog(
        s, "unban",
        `Desbanido: ${targetUser.email} (por ${action.adminName}${action.reason ? ` — ${action.reason}` : ""})`
      );
      return s;
    }

    case "DISMISS_NOTIFICATION": {
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
      };
    }

    default:
      return state;
  }
}
