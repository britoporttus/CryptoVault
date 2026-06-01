# CryptoVault — Trechos de Código Relevantes

Repositório completo: **https://github.com/britoporttus/CryptoVault**

Este documento apresenta os trechos mais importantes do código-fonte, organizados por funcionalidade.

---

## Sumário

1. [Criptografia AES-128-GCM (Backend Python)](#1-criptografia-aes-128-gcm-backend-python)
2. [Sistema de Logs e Moderação](#2-sistema-de-logs-e-moderação)
3. [Banimento Automático por Falhas](#3-banimento-automático-por-falhas)
4. [Envio de E-mail (EmailJS)](#4-envio-de-e-mail-emailjs)
5. [Persistência em localStorage](#5-persistência-em-localstorage)
6. [Integração no Frontend (React)](#6-integração-no-frontend-react)

---

## 1. Criptografia AES-128-GCM (Backend Python)

**Arquivo:** [`backend/app.py`](https://github.com/britoporttus/CryptoVault/blob/main/backend/app.py)

O backend Flask expõe duas rotas REST. A criptografia utiliza AES-128-GCM com chave de 128 bits (16 bytes) e IV aleatório de 12 bytes por arquivo. O formato do arquivo `.encrypted` é `[12 IV][ciphertext][16 tag]`.

### Rota `/encrypt` — Criptografar arquivo

```python
from Crypto.Random import get_random_bytes
from Crypto.Cipher import AES
import base64

@app.route("/encrypt", methods=["POST"])
def encrypt():
    file = request.files["file"]
    data = file.read()

    key = get_random_bytes(16)   # 128 bits
    iv  = get_random_bytes(12)   # IV padrão GCM

    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    ciphertext, tag = cipher.encrypt_and_digest(data)

    # Formato: [12 IV][ciphertext][16 tag]
    encrypted_bytes = iv + ciphertext + tag

    return jsonify({
        "key":       key.hex(),                                  # 32 caracteres hex
        "encrypted": base64.b64encode(encrypted_bytes).decode(), # base64 para o frontend
        "filename":  file.filename + ".encrypted",
    })
```

### Rota `/decrypt` — Descriptografar arquivo

```python
@app.route("/decrypt", methods=["POST"])
def decrypt():
    file    = request.files["file"]
    key_hex = request.form["key"].strip()

    key = bytes.fromhex(key_hex)
    if len(key) != 16:
        return jsonify({"error": "Chave inválida. Use 32 caracteres hex (AES-128)."}), 400

    raw        = file.read()
    iv         = raw[:12]       # primeiros 12 bytes
    ciphertext = raw[12:-16]    # conteúdo cifrado
    tag        = raw[-16:]      # últimos 16 bytes (tag GCM)

    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)

    try:
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    except Exception:
        return jsonify({"error": "Chave incorreta ou arquivo corrompido"}), 400

    original_name = file.filename.removesuffix(".encrypted")
    return send_file(io.BytesIO(plaintext), as_attachment=True,
                     download_name=original_name)
```

---

## 2. Sistema de Logs e Moderação

**Arquivo:** [`src/store.jsx`](https://github.com/britoporttus/CryptoVault/blob/main/src/store.jsx)

O sistema de logs é implementado no reducer global. Toda ação relevante passa pelo helper `withLog`, que prepende a entrada no array de logs (máx. 1 000 entradas) e gera um ID único.

### Helper de log (dentro do reducer)

```javascript
function withLog(s, type, detail, userId) {
  const log = {
    id:       `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    detail,
    userId:   userId || s.currentUser?.id || "system",
    userName: userId
      ? s.users.find((u) => u.id === userId)?.name || "?"
      : s.currentUser?.name || "Sistema",
    time: new Date().toLocaleString("pt-BR"),
  };
  return { ...s, logs: [log, ...s.logs].slice(0, 1000) };
}
```

### Tipos de log rastreados

| Tipo | Descrição |
|------|-----------|
| `login` | Login bem-sucedido |
| `login_fail` | Falha de autenticação |
| `register` | Novo cadastro |
| `encrypt` | Arquivo criptografado |
| `decrypt` | Arquivo descriptografado |
| `decrypt_fail` | Falha de descriptografia |
| `ban` | Usuário banido |
| `unban` | Usuário desbanido |
| `suspicious_ratelimit` | Rate limit de login atingido |
| `suspicious_cred` | Erros repetidos de credencial |
| `suspicious_file` | Upload de extensão proibida |

### Rate limiting de login

```javascript
case "LOGIN": {
  const windowStart  = now_ms - CONFIG.LOGIN_WINDOW_MS;  // janela de 15 min
  const recentAll    = prevAttempts.filter((a) => a.at > windowStart);
  const totalAfter   = recentAll.length + 1;

  // Dispara alerta ao cruzar o limiar (5 tentativas)
  if (totalAfter === CONFIG.LOGIN_MAX_ATTEMPTS) {
    s = withLog(s, "suspicious_ratelimit",
      `Rate limit: ${totalAfter} tentativas em ${CONFIG.LOGIN_WINDOW_MS / 60000}min — ${action.email}`
    );
    s = withNotification(s, "suspicious_ratelimit", action.email);
  }
  // ...
}
```

---

## 3. Banimento Automático por Falhas

**Arquivo:** [`src/store.jsx`](https://github.com/britoporttus/CryptoVault/blob/main/src/store.jsx)

Após 3 falhas de descriptografia o usuário é banido automaticamente. A ação registra um `banEntry` no histórico de moderação (`banHistory[]`) com o motivo descritivo.

```javascript
case "DECRYPT_FAILED": {
  const user     = state.users.find((u) => u.id === state.currentUser?.id);
  const newCount = (user.suspiciousCount || 0) + 1;
  const banned   = newCount >= CONFIG.DECRYPT_MAX_FAILS;  // padrão: 3

  const banEntry = banned ? {
    action:   "ban",
    at:       now,
    trigger:  `Excedeu o limite de tentativas de descriptografia: ${newCount} tentativas `
              + `inválidas com chave incorreta no arquivo "${action.fileName}". `
              + `Acesso bloqueado automaticamente por segurança.`,
    by:       "system",
    byName:   "Sistema automático",
    reverted: false,
  } : null;

  const updatedUsers = state.users.map((u) =>
    u.id === user.id
      ? { ...u, suspiciousCount: newCount, banned,
          banHistory: banEntry ? [...u.banHistory, banEntry] : u.banHistory }
      : u
  );

  let s = { ...state, users: updatedUsers, currentUser: banned ? null : state.currentUser };
  s = withLog(s, "decrypt_fail", `Falha (${newCount}/${CONFIG.DECRYPT_MAX_FAILS}): ${action.fileName}`);
  if (banned) {
    s = withLog(s, "ban", banEntry.trigger, user.id);
  }
  return s;
}
```

### Desbanimento com audit trail

```javascript
case "UNBAN_USER": {
  // Marca o ban mais recente como revertido
  const lastBanIdx = rawHistory.reduce(
    (acc, e, i) => (e.action === "ban" && !e.reverted ? i : acc), -1
  );
  const markedHistory = rawHistory.map((entry, i) =>
    i === lastBanIdx
      ? { ...entry, reverted: true, revertedBy: action.adminId, revertedAt: now }
      : entry
  );

  const unbanEntry = {
    action: "unban", at: now,
    adminId: action.adminId, adminName: action.adminName,
    reason: action.reason || null,
  };

  // Notificação in-app entregue no próximo login do usuário
  const pendingNotif = {
    id:      `pn-${Date.now()}`,
    message: `Sua conta foi reativada por ${action.adminName}${
              action.reason ? ` — Motivo: ${action.reason}` : ""}. Acesso restaurado em ${now}.`,
    time:    now,
    type:    "unban",
  };

  const updatedUsers = state.users.map((u) =>
    u.id === action.userId
      ? { ...u, banned: false, suspiciousCount: 0,
          banHistory: [...markedHistory, unbanEntry],
          pendingNotifications: [...u.pendingNotifications, pendingNotif] }
      : u
  );
  // ...
}
```

---

## 4. Envio de E-mail (EmailJS)

**Arquivo:** [`src/emailService.js`](https://github.com/britoporttus/CryptoVault/blob/main/src/emailService.js)

Todos os e-mails são enviados pelo frontend via **EmailJS** (sem servidor de e-mail próprio). O sistema usa o e-mail cadastrado no perfil de cada admin — não um endereço fixo no código.

### Retry automático

```javascript
async function sendWithRetry(templateId, params, retries = 2) {
  if (!isConfigured() || !templateId) {
    console.warn("[EmailService] Não configurado — e-mail não enviado.");
    return;
  }
  try {
    await emailjs.send(SERVICE_ID, templateId, params, { publicKey: PUBLIC_KEY });
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 3000));  // aguarda 3s
      return sendWithRetry(templateId, params, retries - 1);
    }
    throw err;
  }
}
```

### Notificação de banimento

```javascript
// Notifica todos os admins (e-mail do perfil de cada um)
export function notifyAdminBan(bannedUser, trigger, timestamp, adminEmails = []) {
  return Promise.all(
    adminEmails.map((to_email) =>
      sendWithRetry(T_BAN_ADMIN, {
        to_email,
        user_name:   bannedUser.name,
        user_email:  bannedUser.email,
        trigger,                        // motivo descritivo
        timestamp,
        review_link: window.location.origin,
      })
    )
  );
}

// Notifica o próprio usuário banido
export function notifyUserBan(user, trigger, timestamp) {
  return sendWithRetry(T_BAN_USER, {
    to_email:  user.email,
    user_name: user.name,
    trigger,
    timestamp,
  });
}

// Notifica o usuário que sua conta foi reativada
export function notifyUserUnban(user, adminName, reason, timestamp) {
  return sendWithRetry(T_UNBAN, {
    to_email:   user.email,
    user_name:  user.name,
    admin_name: adminName,
    reason:     reason || "Sem motivo especificado",
    timestamp,
  });
}
```

### Variáveis de ambiente necessárias

```env
VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
VITE_EMAILJS_PUBLIC_KEY=sua_public_key
VITE_EMAILJS_TEMPLATE_BAN=template_xxxxxxx       # admin: usuário banido
VITE_EMAILJS_TEMPLATE_BAN_USER=template_xxxxxxx  # usuário: conta banida
VITE_EMAILJS_TEMPLATE_SUSPICIOUS=template_xxxxxxx # admin: atividade suspeita
VITE_EMAILJS_TEMPLATE_UNBAN=template_xxxxxxx     # usuário: conta reativada
```

---

## 5. Persistência em localStorage

**Arquivo:** [`src/persistence.js`](https://github.com/britoporttus/CryptoVault/blob/main/src/persistence.js)

O estado da aplicação é persistido no `localStorage` a cada mudança. `currentUser` e `notifications` são intencionalmente excluídos — forçam re-login e são efêmeros.

```javascript
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
    // Exclui currentUser (segurança) e notifications (efêmeras)
    const { currentUser, notifications, ...saveable } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable));
  } catch {
    // Falha silenciosa (ex.: modo privado com storage desativado)
  }
}
```

---

## 6. Integração no Frontend (React)

**Arquivo:** [`src/App.jsx`](https://github.com/britoporttus/CryptoVault/blob/main/src/App.jsx)

### Inicialização do estado com merge do localStorage

Garante que os admins padrão sempre existam, mesmo que o localStorage já tenha dados de outra sessão:

```javascript
const [state, dispatch] = useReducer(appReducer, null, () => {
  const saved   = loadPersistedState();
  const initial = createInitialState();
  if (!saved) return initial;

  const savedUsers    = saved.users || [];
  const savedIds      = new Set(savedUsers.map((u) => u.id));
  const missingAdmins = initial.users.filter((u) => !savedIds.has(u.id));

  return {
    ...initial,
    ...saved,
    users:         [...missingAdmins, ...savedUsers], // admins padrão sempre presentes
    currentUser:   null,  // força re-login por segurança
    notifications: [],    // notificações são efêmeras
  };
});
```

### Disparo de e-mails sem reenvio duplicado

Ao recarregar a página, os logs históricos do localStorage não disparam novos e-mails — o `Set` é inicializado com todos os IDs existentes:

```javascript
// Pré-popula com todos os logs já persistidos; evita reenvio a cada reload
const processedLogIds = useRef(null);
if (processedLogIds.current === null) {
  processedLogIds.current = new Set(state.logs.map((l) => l.id));
}

useEffect(() => {
  const adminEmails = state.users
    .filter((u) => u.role === "admin")
    .map((u) => u.email);  // e-mails reais do perfil, não hardcoded

  for (const log of state.logs) {
    if (processedLogIds.current.has(log.id)) break; // logs mais antigos: pula
    processedLogIds.current.add(log.id);

    if (log.type === "ban") {
      const banned = state.users.find((u) => u.id === log.userId);
      if (banned) {
        emailService.notifyAdminBan(banned, log.detail, log.time, adminEmails);
        emailService.notifyUserBan(banned, log.detail, log.time);
      }
    }
    if (["suspicious_ratelimit", "suspicious_cred", "suspicious_file"].includes(log.type)) {
      emailService.notifyAdminSuspicious(log.type, log.detail, log.time, adminEmails);
    }
  }
}, [state.logs, state.users]);
```

### Chamada ao backend para criptografar (fetch)

```javascript
async function doEncrypt() {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${CONFIG.API_URL}/encrypt`, { method: "POST", body: form });
  const { key, encrypted, filename } = await res.json();

  // Converte base64 → Blob para download direto no browser
  const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const url   = URL.createObjectURL(new Blob([bytes]));

  dispatch({ type: "FILE_ENCRYPTED", fileName: file.name, keyHex: key });
  setResult({ ok: true, keyHex: key, url, dlName: filename });
}
```

---

## Repositório

Todo o código-fonte está disponível em:
**https://github.com/britoporttus/CryptoVault**

Projeto acadêmico — FATEC. Desenvolvido com React 18, Vite, Python Flask e PyCryptodome.
