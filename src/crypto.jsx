// ════════════════════════════════════════
// crypto.js — AES-GCM 128-bit encryption
// ════════════════════════════════════════
import { CONFIG } from "./config.js";

export async function generateKey() {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 128 },
    true,
    ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  const hex = Array.from(new Uint8Array(raw))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { key, hex };
}

export async function importKey(hexStr) {
  const clean = hexStr.trim();
  if (!/^[0-9a-fA-F]{32}$/.test(clean)) {
    throw new Error("A chave deve ter exatamente 32 caracteres hexadecimais (16 bytes).");
  }
  const bytes = new Uint8Array(clean.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM", length: 128 }, false, [
    "decrypt",
  ]);
}

export async function encryptFile(file, cryptoKey) {
  const data = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, data);
  // Format: [12 bytes IV][ciphertext + GCM tag]
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return combined;
}

export async function decryptFile(arrayBuffer, cryptoKey) {
  const data = new Uint8Array(arrayBuffer);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
}

// Allowlist de extensões — configurável via VITE_ALLOWED_EXTENSIONS
export const ALLOWED_EXTENSIONS = CONFIG.ALLOWED_EXTENSIONS;

export function isFileAllowed(fileName) {
  const ext = "." + fileName.split(".").pop().toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}
