// ════════════════════════════════════════
// crypto.js — AES-GCM 128 / 256-bit encryption
// Formato: [12 bytes IV][ciphertext][16 bytes tag]
// Compatível com os scripts Python (pycryptodome AES-GCM)
// ════════════════════════════════════════

import { CONFIG } from "./config.js";

// Gera uma chave AES-GCM nova.
// bits: 128 (padrão, chave de 32 hex) ou 256 (chave de 64 hex)
export async function generateKey(bits = 128) {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: bits },
    true,
    ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  const hex = Array.from(new Uint8Array(raw))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { key, hex };
}

// Importa uma chave a partir de hex.
// Aceita 32 chars (AES-128) ou 64 chars (AES-256).
export async function importKey(hexStr) {
  const clean = hexStr.trim();
  if (!/^[0-9a-fA-F]{32}$/.test(clean) && !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(
      "A chave deve ter 32 caracteres hex (AES-128) ou 64 caracteres hex (AES-256)."
    );
  }
  const bits  = clean.length === 32 ? 128 : 256;
  const bytes = new Uint8Array(clean.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey(
    "raw", bytes, { name: "AES-GCM", length: bits }, false, ["decrypt"]
  );
}

// Criptografa um arquivo. Retorna Uint8Array no formato [12 IV][ciphertext][tag].
export async function encryptFile(file, cryptoKey) {
  const data      = await file.arrayBuffer();
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, data);
  // Web Crypto retorna ciphertext+tag concatenados — idêntico ao formato Python
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return combined;
}

// Descriptografa um arquivo no formato [12 IV][ciphertext][tag].
export async function decryptFile(arrayBuffer, cryptoKey) {
  const data       = new Uint8Array(arrayBuffer);
  const iv         = data.slice(0, 12);
  const ciphertext = data.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
}

// Allowlist de extensões — configurável via VITE_ALLOWED_EXTENSIONS
export const ALLOWED_EXTENSIONS = CONFIG.ALLOWED_EXTENSIONS;

export function isFileAllowed(fileName) {
  const ext = "." + fileName.split(".").pop().toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}
