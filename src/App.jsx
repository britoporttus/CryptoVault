import { useState, useReducer, useCallback, useEffect, useRef } from "react";
import { validatePassword, isPasswordValid, createInitialState, appReducer } from "./store.jsx";
import { CONFIG, isFileAllowed, ALLOWED_EXTENSIONS } from "./config.js";
import {
  IconLock, IconUnlock, IconUpload, IconDownload, IconUsers, IconUser, IconFile,
  IconBell, IconShield, IconKey, IconX, IconCheck, IconSettings, IconFolder,
  IconActivity, IconLogOut, IconCopy, IconSearch, IconEye, IconBan,
} from "./icons.jsx";
import * as emailService from "./emailService.js";
import { loadPersistedState, persistState } from "./persistence.js";

/* ════════════════════════════════════════════════
   AUTH PAGE  (Login / Registro)
   ════════════════════════════════════════════════ */
function AuthPage({ state, dispatch }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const checks = validatePassword(password);

  function handleLogin() {
    setError("");
    const u = state.users.find((x) => x.email === email && x.password === password);
    if (!u) { dispatch({ type: "LOGIN", email, password }); setError("E-mail ou senha inválidos."); return; }
    if (u.banned) { setError("Conta banida por atividade suspeita."); return; }
    dispatch({ type: "LOGIN", email, password });
  }

  function handleRegister() {
    setError(""); setSuccess("");
    if (!name || !email || !password) { setError("Preencha todos os campos."); return; }
    if (state.users.find((u) => u.email === email)) { setError("Este e-mail já está cadastrado."); return; }
    if (!isPasswordValid(password)) { setError("A senha não atende aos requisitos."); return; }
    dispatch({ type: "REGISTER", user: { name, email, password } });
    setSuccess("Conta criada com sucesso! Faça login.");
    setMode("login");
    setPassword("");
  }

  function onKey(e) { if (e.key === "Enter") mode === "login" ? handleLogin() : handleRegister(); }

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-noise" />
      <div className="auth-card fade-in">
        <div className="auth-logo"><IconShield style={{ width: 24, height: 24 }} /></div>
        <h1 className="auth-title">{mode === "login" ? "Acessar CryptoVault" : "Criar Conta"}</h1>
        <p className="auth-desc">{mode === "login" ? "Sistema de criptografia de arquivos" : "Preencha seus dados para se cadastrar"}</p>

        {error && <div className="msg msg-error">{error}</div>}
        {success && <div className="msg msg-success">{success}</div>}

        {mode === "register" && (
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" onKeyDown={onKey} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">E-mail</label>
          <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@email.com" onKeyDown={onKey} />
        </div>

        <div className="form-group">
          <label className="form-label">Senha</label>
          <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={onKey} />
          {mode === "register" && (
            <div className="pw-bar">
              {checks.map((c, i) => <span key={i} className={`pw-rule ${c.ok ? "pass" : ""}`}><span className="dot" />{c.msg}</span>)}
            </div>
          )}
        </div>

        <button className="btn btn-primary btn-block" onClick={mode === "login" ? handleLogin : handleRegister}>
          {mode === "login" ? "Entrar" : "Cadastrar"}
        </button>

        <div className="auth-footer">
          {mode === "login"
            ? <>Não tem conta? <span className="auth-link" onClick={() => { setMode("register"); setError(""); setSuccess(""); }}>Cadastre-se</span></>
            : <>Já tem conta? <span className="auth-link" onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Fazer login</span></>
          }
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   PAGE: Minha Conta
   ════════════════════════════════════════════════ */
function PageMinhaConta({ state }) {
  const u = state.currentUser;
  const myFiles = state.files.filter((f) => f.userId === u.id);
  const myLogs = state.logs.filter((l) => l.userId === u.id);

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">Minha Conta</h2>
        <p className="page-desc">Informações do seu perfil</p>
      </div>

      <div className="card">
        <div className="account-header">
          <div className="account-avatar">{u.name[0].toUpperCase()}</div>
          <div>
            <div className="account-name">{u.name}</div>
            <div className="account-email">{u.email}</div>
            <span className="account-role" style={{
              background: u.role === "admin" ? "var(--purple-dim)" : "var(--accent-dim)",
              color: u.role === "admin" ? "var(--purple)" : "var(--accent)",
            }}>
              {u.role === "admin" ? "Administrador" : "Usuário"}
            </span>
          </div>
        </div>

        <div className="info-row"><span className="info-label">Cadastrado em</span><span className="info-value">{u.createdAt}</span></div>
        <div className="info-row"><span className="info-label">Arquivos criptografados</span><span className="info-value">{myFiles.length}</span></div>
        <div className="info-row"><span className="info-label">Atividades registradas</span><span className="info-value">{myLogs.length}</span></div>
        <div className="info-row"><span className="info-label">Status</span><span className="info-value"><span className={`tag ${u.banned ? "tag-red" : "tag-green"}`}>{u.banned ? "Banido" : "Ativo"}</span></span></div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   PAGE: Criptografar
   ════════════════════════════════════════════════ */
function PageCriptografar({ state, dispatch }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(f) {
    if (!isFileAllowed(f.name)) {
      dispatch({ type: "SUSPICIOUS_FILE", fileName: f.name });
      setResult({ error: `Tipo não permitido. Use: ${ALLOWED_EXTENSIONS.join(", ")}` });
      setFile(null);
      return;
    }
    setFile(f);
    setResult(null);
  }

  async function doEncrypt() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${CONFIG.API_URL}/encrypt`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro no servidor");
      }

      const { key, encrypted, filename } = await res.json();

      // Converte base64 → Blob para download
      const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
      const url   = URL.createObjectURL(new Blob([bytes]));

      dispatch({ type: "FILE_ENCRYPTED", fileName: file.name, keyHex: key });
      setResult({ ok: true, keyHex: key, url, dlName: filename });
    } catch (err) {
      setResult({ error: "Erro: " + err.message });
    }
    setBusy(false);
  }

  function copyKey() {
    if (result?.keyHex) navigator.clipboard?.writeText(result.keyHex);
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">Criptografar Arquivo</h2>
        <p className="page-desc">AES-128-GCM — chave única gerada pelo servidor Python</p>
      </div>

      <div className="card">
        <div className="card-header"><IconLock /> Selecionar arquivo</div>
        <div
          className={`dropzone ${dragOver ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]); }}
        >
          <input type="file" accept={ALLOWED_EXTENSIONS.join(",")} onChange={(e) => { if (e.target.files[0]) pickFile(e.target.files[0]); }} />
          <div className="dropzone-icon"><IconUpload style={{ width: 28, height: 28 }} /></div>
          <div className="dropzone-text">Arraste um arquivo ou clique para selecionar</div>
          <div className="dropzone-hint">Formatos aceitos: PDF, Word, Excel, TXT</div>
          {file && <div className="dropzone-file"><IconFile style={{ width: 14, height: 14 }} />{file.name}</div>}
        </div>

        {result?.error && <div className="msg msg-error mt-16">{result.error}</div>}

        {file && !result?.ok && (
          <button className="btn btn-primary mt-16" onClick={doEncrypt} disabled={busy}>
            <IconLock style={{ width: 16, height: 16 }} />{busy ? "Processando..." : "Criptografar"}
          </button>
        )}

        {result?.ok && (
          <div className="mt-16">
            <div className="msg msg-success">Arquivo criptografado com sucesso!</div>
            <label className="form-label">Chave gerada (guarde com segurança):</label>
            <div className="key-box">
              {result.keyHex}
              <button className="copy-btn" onClick={copyKey}>copiar</button>
            </div>
            <a href={result.url} download={result.dlName} className="btn btn-success mt-12" style={{ textDecoration: "none" }}>
              <IconDownload style={{ width: 16, height: 16 }} />Baixar arquivo criptografado
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   PAGE: Descriptografar
   ════════════════════════════════════════════════ */
function PageDescriptografar({ state, dispatch }) {
  const [file, setFile] = useState(null);
  const [keyHex, setKeyHex] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function doDecrypt() {
    if (!file || !keyHex) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("key", keyHex);

      const res = await fetch(`${CONFIG.API_URL}/decrypt`, { method: "POST", body: form });

      if (!res.ok) {
        dispatch({ type: "DECRYPT_FAILED", fileName: file.name });
        const u   = state.users.find((x) => x.id === state.currentUser?.id);
        const cnt = (u?.suspiciousCount || 0) + 1;
        setResult({
          error: cnt >= 3
            ? "Conta banida por múltiplas tentativas inválidas."
            : `Chave incorreta ou arquivo corrompido. Tentativa ${cnt}/3.`,
        });
      } else {
        const blob     = await res.blob();
        const origName = file.name.replace(/\.encrypted$/, "");
        const url      = URL.createObjectURL(blob);
        dispatch({ type: "FILE_DECRYPTED", fileName: file.name });
        setResult({ ok: true, url, origName });
      }
    } catch (err) {
      setResult({ error: "Servidor indisponível. Verifique se o backend está rodando." });
    }
    setBusy(false);
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">Descriptografar Arquivo</h2>
        <p className="page-desc">Insira o arquivo .encrypted e a chave AES-128 (32 caracteres hex)</p>
      </div>

      <div className="card">
        <div className="card-header"><IconUnlock /> Dados de descriptografia</div>

        <div className="form-group">
          <label className="form-label">Arquivo criptografado</label>
          <input type="file" className="form-input" onChange={(e) => { if (e.target.files[0]) { setFile(e.target.files[0]); setResult(null); } }} />
        </div>

        <div className="form-group">
          <label className="form-label">Chave (32 caracteres hex)</label>
          <input
            className="form-input form-input-mono"
            value={keyHex}
            onChange={(e) => setKeyHex(e.target.value)}
            placeholder="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
          />
        </div>

        <button className="btn btn-primary" onClick={doDecrypt} disabled={busy || !file || !keyHex}>
          <IconUnlock style={{ width: 16, height: 16 }} />{busy ? "Processando..." : "Descriptografar"}
        </button>

        {result?.error && <div className="msg msg-error mt-16">{result.error}</div>}
        {result?.ok && (
          <div className="mt-16">
            <div className="msg msg-success">Arquivo descriptografado com sucesso!</div>
            <a href={result.url} download={result.origName} className="btn btn-success" style={{ textDecoration: "none" }}>
              <IconDownload style={{ width: 16, height: 16 }} />Baixar {result.origName}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   PAGE: Meus Arquivos
   ════════════════════════════════════════════════ */
function PageMeusArquivos({ state }) {
  const myFiles = state.files.filter((f) => f.userId === state.currentUser.id);

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">Meus Arquivos</h2>
        <p className="page-desc">Histórico de arquivos criptografados nesta sessão</p>
      </div>

      <div className="card">
        <div className="card-header"><IconFolder /> Arquivos criptografados</div>
        {myFiles.length === 0 ? (
          <div className="empty-state">Nenhum arquivo criptografado ainda.</div>
        ) : (
          myFiles.map((f) => (
            <div key={f.id} className="file-card">
              <div className="file-icon enc"><IconLock style={{ width: 18, height: 18 }} /></div>
              <div className="file-meta">
                <div className="file-name">{f.name}</div>
                <div className="file-time">{f.time}</div>
              </div>
              <div className="file-key-preview" title="Preview da chave">{f.keyPreview}</div>
              <span className="tag tag-green">Criptografado</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   UNBAN MODAL — confirmação com motivo + audit trail
   ════════════════════════════════════════════════ */
function UnbanModal({ user, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Desbanir Usuário</h3>
          <button className="modal-close" onClick={onCancel}><IconX /></button>
        </div>

        <div className="modal-body">
          <div className="modal-user-info">
            <div className="account-avatar" style={{ width: 36, height: 36, fontSize: 16, flexShrink: 0 }}>
              {user.name[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{user.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{user.email}</div>
            </div>
          </div>

          {(user.banHistory || []).length > 0 && (
            <div className="ban-history">
              <div className="ban-history-title">Histórico de moderação</div>
              {user.banHistory.map((entry, i) => (
                <div key={i} className="ban-entry">
                  <span className={`tag ${entry.action === "ban" ? "tag-red" : "tag-green"}`}>
                    {entry.action === "ban" ? "Banido" : "Desbanido"}
                  </span>
                  {entry.reverted && <span className="tag tag-amber">Revertido</span>}
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{entry.at}</span>
                  {entry.trigger && (
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{entry.trigger}</span>
                  )}
                  {entry.reason && (
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Motivo: {entry.reason}</span>
                  )}
                  {entry.adminName && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Por: {entry.adminName}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
            <label className="form-label">Motivo do desbanimento (opcional)</label>
            <input
              className="form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Verificada ação legítima do usuário"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && onConfirm(reason.trim())}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-success" onClick={() => onConfirm(reason.trim())}>
            <IconCheck style={{ width: 14, height: 14 }} /> Confirmar Desbanimento
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   ADMIN PAGE — com sub-tabs
   ════════════════════════════════════════════════ */
function PageAdmin({ state, dispatch, onUnban }) {
  const [tab, setTab] = useState("logs");
  const [logFilter, setLogFilter] = useState("all");
  const [newAlertType, setNewAlertType] = useState("");
  const [newAlertMsg, setNewAlertMsg] = useState("");
  const [unbanTarget, setUnbanTarget] = useState(null);

  if (state.currentUser?.role !== "admin") {
    return (
      <div className="card empty-state fade-in">
        <IconShield style={{ width: 32, height: 32, color: "var(--text-muted)", margin: "0 auto 12px", display: "block" }} />
        <h3 style={{ marginBottom: 4 }}>Acesso Restrito</h3>
        <p style={{ color: "var(--text-muted)" }}>Apenas administradores podem acessar este painel.</p>
      </div>
    );
  }

  const logTypes = ["all", "login", "login_fail", "register", "encrypt", "decrypt", "decrypt_fail", "ban", "logout", "unban", "suspicious_ratelimit", "suspicious_cred", "suspicious_file"];
  const filteredLogs = logFilter === "all" ? state.logs : state.logs.filter((l) => l.type === logFilter);

  const tagColor = (t) => {
    const m = {
      login: "tag-green", login_fail: "tag-red", register: "tag-blue", encrypt: "tag-blue",
      decrypt: "tag-green", decrypt_fail: "tag-red", ban: "tag-red", logout: "tag-amber",
      upload: "tag-blue", unban: "tag-purple",
      suspicious_ratelimit: "tag-red", suspicious_cred: "tag-red", suspicious_file: "tag-red",
    };
    return m[t] || "tag-blue";
  };

  const otherUsers = state.users.filter((u) => u.id !== state.currentUser.id);

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">Painel do Administrador</h2>
        <p className="page-desc">Gerenciamento de logs, usuários e alertas</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-box"><div className="stat-num" style={{ color: "var(--accent)" }}>{state.users.length}</div><div className="stat-lbl">Usuários</div></div>
        <div className="stat-box"><div className="stat-num" style={{ color: "var(--green)" }}>{state.logs.length}</div><div className="stat-lbl">Logs</div></div>
        <div className="stat-box"><div className="stat-num" style={{ color: "var(--amber)" }}>{state.files.length}</div><div className="stat-lbl">Arquivos</div></div>
        <div className="stat-box"><div className="stat-num" style={{ color: "var(--red)" }}>{state.users.filter((u) => u.banned).length}</div><div className="stat-lbl">Banidos</div></div>
      </div>

      {/* Sub-tabs */}
      <div className="sub-tabs">
        {[
          { id: "logs", label: "Logs de Eventos", icon: <IconActivity style={{ width: 14, height: 14 }} /> },
          { id: "users", label: "Usuários", icon: <IconUsers style={{ width: 14, height: 14 }} /> },
          { id: "alerts", label: "Alertas", icon: <IconBell style={{ width: 14, height: 14 }} /> },
        ].map((t) => (
          <div key={t.id} className={`sub-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {t.icon}{t.label}
          </div>
        ))}
      </div>

      {/* TAB: Logs */}
      {tab === "logs" && (
        <div className="card">
          <div className="card-header"><IconActivity /> Registro de Atividades</div>
          <div className="filter-bar">
            {logTypes.map((t) => (
              <button key={t} className={`btn btn-sm ${logFilter === t ? "btn-primary" : "btn-ghost"}`} onClick={() => setLogFilter(t)}>
                {t === "all" ? "Todos" : t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Hora</th><th>Tipo</th><th>Detalhe</th><th>Usuário</th></tr></thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={4} className="empty-state">Nenhum log encontrado</td></tr>
                ) : filteredLogs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap" }}>{l.time}</td>
                    <td><span className={`tag ${tagColor(l.type)}`}>{l.type}</span></td>
                    <td style={{ color: "var(--text-primary)" }}>{l.detail}</td>
                    <td>{l.userName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Usuários */}
      {tab === "users" && (
        <div className="card">
          <div className="card-header"><IconUsers /> Gerenciamento de Usuários</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>E-mail</th><th>Cadastro</th><th>Tentativas</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody>
                {otherUsers.length === 0 ? (
                  <tr><td colSpan={6} className="empty-state">Nenhum usuário cadastrado</td></tr>
                ) : otherUsers.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.name}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{u.email}</td>
                    <td style={{ fontSize: 12 }}>{u.createdAt}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{u.suspiciousCount}/3</td>
                    <td><span className={`tag ${u.banned ? "tag-red" : "tag-green"}`}>{u.banned ? "Banido" : "Ativo"}</span></td>
                    <td style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {u.banned && (
                        <button className="btn btn-sm btn-ghost" onClick={() => setUnbanTarget(u)}>
                          Desbanir
                        </button>
                      )}
                      {(u.banHistory || []).length > 0 && (
                        <span
                          className="ban-hist-badge"
                          title={`${u.banHistory.length} registro(s) de moderação`}
                        >
                          {u.banHistory.length}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Alertas */}
      {tab === "alerts" && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><IconBell /> Alertas Configurados</div>
            {state.alerts.map((a) => (
              <div key={a.id} className="alert-row">
                <div className="alert-info">
                  <div className="alert-name">{a.message}</div>
                  <div className="alert-type">{a.type}</div>
                </div>
                <div className={`toggle ${a.active ? "on" : ""}`} onClick={() => dispatch({ type: "TOGGLE_ALERT", id: a.id })}>
                  <div className="toggle-dot" />
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header"><IconSettings /> Criar Novo Alerta</div>
            <div className="form-group">
              <label className="form-label">Tipo do alerta</label>
              <input className="form-input" placeholder="ex: download, custom" value={newAlertType} onChange={(e) => setNewAlertType(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Mensagem</label>
              <input className="form-input" placeholder="Descrição do alerta" value={newAlertMsg} onChange={(e) => setNewAlertMsg(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={() => {
              if (newAlertType.trim() && newAlertMsg.trim()) {
                dispatch({ type: "ADD_ALERT", alertType: newAlertType.trim(), message: newAlertMsg.trim() });
                setNewAlertType(""); setNewAlertMsg("");
              }
            }}>
              Adicionar Alerta
            </button>

            {/* Notifications history */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>Últimas notificações</div>
              {state.notifications.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}>Nenhuma notificação</div>
              ) : state.notifications.slice(0, 10).map((n) => (
                <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-secondary)" }}>
                  <div>{n.message}</div>
                  <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{n.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {unbanTarget && (
        <UnbanModal
          user={unbanTarget}
          onConfirm={(reason) => { onUnban(unbanTarget.id, reason); setUnbanTarget(null); }}
          onCancel={() => setUnbanTarget(null)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ════════════════════════════════════════════════ */
function Toasts({ notifications, dispatch }) {
  if (notifications.length === 0) return null;
  return (
    <div className="toast-container">
      {notifications.slice(0, 3).map((n) => (
        <div key={n.id} className="toast">
          <IconBell style={{ width: 16, height: 16, color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
          <div className="toast-body">
            <div className="toast-msg">{n.message}</div>
            <div className="toast-time">{n.time}</div>
          </div>
          <button className="toast-close" onClick={() => dispatch({ type: "DISMISS_NOTIFICATION", id: n.id })}><IconX /></button>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════
   TOP NAVIGATION BAR
   ════════════════════════════════════════════════ */
function TopNav({ page, setPage, state, dispatch }) {
  const u = state.currentUser;
  const isAdmin = u.role === "admin";
  const hasNotif = state.notifications.length > 0;

  const userLinks = [
    { id: "account", label: "Minha Conta", icon: <IconUser /> },
    { id: "encrypt", label: "Criptografar", icon: <IconLock /> },
    { id: "decrypt", label: "Descriptografar", icon: <IconUnlock /> },
    { id: "files", label: "Meus Arquivos", icon: <IconFolder /> },
  ];

  const adminLinks = [
    { id: "admin", label: "Painel Admin", icon: <IconSettings />, notif: hasNotif },
  ];

  const links = isAdmin ? [...userLinks, ...adminLinks] : userLinks;

  return (
    <nav className="topnav">
      <div className="topnav-brand">
        <div className="brand-icon"><IconShield style={{ width: 18, height: 18, color: "white" }} /></div>
        <div>
          <div className="brand-text">CryptoVault</div>
        </div>
        <span className="brand-tag">AES-128</span>
      </div>

      <div className="topnav-links">
        {links.map((l) => (
          <div key={l.id} className={`topnav-link ${page === l.id ? "active" : ""}`} onClick={() => setPage(l.id)}>
            {l.icon}<span>{l.label}</span>
            {l.notif && <span className="badge" />}
          </div>
        ))}
      </div>

      <div className="topnav-right">
        <div className="topnav-user">
          <div className="user-avatar">{u.name[0].toUpperCase()}</div>
          <div className="user-meta">
            <div className="user-meta-name">{u.name}</div>
            <div className="user-meta-role">{isAdmin ? "Admin" : "Usuário"}</div>
          </div>
        </div>
        <button className="btn-logout" onClick={() => dispatch({ type: "LOGOUT" })}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <IconLogOut style={{ width: 14, height: 14 }} />Sair
          </span>
        </button>
      </div>
    </nav>
  );
}

/* ════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════ */
export default function App() {
  const [state, dispatch] = useReducer(appReducer, null, () => {
    const saved   = loadPersistedState();
    const initial = createInitialState();
    if (!saved) return initial;
    // Garante que todos os admins padrão sempre existem no localStorage
    const savedUsers   = saved.users || [];
    const savedIds     = new Set(savedUsers.map((u) => u.id));
    const missingAdmins = initial.users.filter((u) => !savedIds.has(u.id));
    return {
      ...initial,
      ...saved,
      users:         [...missingAdmins, ...savedUsers],
      currentUser:   null,   // força re-login por segurança
      notifications: [],     // notificações são efêmeras
    };
  });

  const [page, setPage] = useState("encrypt");
  const processedLogIds = useRef(new Set());

  // Persiste estado relevante no localStorage a cada mudança
  useEffect(() => {
    persistState(state);
  }, [state]);

  // Dispara e-mails em resposta a novos logs (async, non-blocking)
  // Admin recebe no e-mail cadastrado no perfil; usuário recebe no e-mail do registro.
  useEffect(() => {
    const adminEmails = state.users
      .filter((u) => u.role === "admin")
      .map((u) => u.email);

    for (const log of state.logs) {
      if (processedLogIds.current.has(log.id)) break;
      processedLogIds.current.add(log.id);

      if (log.type === "ban") {
        const banned = state.users.find((u) => u.id === log.userId);
        if (banned) {
          // Notifica todos os admins (e-mail do perfil deles)
          emailService.notifyAdminBan(banned, log.detail, log.time, adminEmails).catch(console.error);
          // Notifica o próprio usuário banido (e-mail do registro)
          emailService.notifyUserBan(banned, log.detail, log.time).catch(console.error);
        }
      }
      if (["suspicious_ratelimit", "suspicious_cred", "suspicious_file"].includes(log.type)) {
        // Notifica todos os admins (e-mail do perfil deles)
        emailService.notifyAdminSuspicious(log.type, log.detail, log.time, adminEmails).catch(console.error);
      }
    }
  }, [state.logs, state.users]);

  // Handler de desbanimento: atualiza estado + envia e-mail ao usuário desbanido
  const handleUnban = useCallback((userId, reason) => {
    const target = state.users.find((u) => u.id === userId);
    const now    = new Date().toLocaleString("pt-BR");
    dispatch({
      type:      "UNBAN_USER",
      userId,
      reason,
      adminId:   state.currentUser.id,
      adminName: state.currentUser.name,
    });
    if (target) {
      emailService.notifyUserUnban(target, state.currentUser.name, reason, now).catch(console.error);
    }
  }, [state.users, state.currentUser]);

  if (!state.currentUser) {
    return <AuthPage state={state} dispatch={dispatch} />;
  }

  return (
    <>
      <Toasts notifications={state.notifications} dispatch={dispatch} />
      <TopNav page={page} setPage={setPage} state={state} dispatch={dispatch} />
      <div className="main-wrap">
        {page === "account" && <PageMinhaConta state={state} />}
        {page === "encrypt" && <PageCriptografar state={state} dispatch={dispatch} />}
        {page === "decrypt" && <PageDescriptografar state={state} dispatch={dispatch} />}
        {page === "files"   && <PageMeusArquivos state={state} />}
        {page === "admin"   && <PageAdmin state={state} dispatch={dispatch} onUnban={handleUnban} />}
      </div>
    </>
  );
}
