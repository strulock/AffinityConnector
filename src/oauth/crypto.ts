// AES-256-GCM encryption for Affinity API keys stored in KV.
// Each record gets a random 12-byte IV; the ciphertext is stored as base64(iv + ciphertext + tag).

const IV_LENGTH = 12;

/** Import a hex-encoded 256-bit key for AES-GCM. */
export async function importEncryptionKey(hexKey: string): Promise<CryptoKey> {
  const bytes = hexToBytes(hexKey);
  if (bytes.length !== 32) {
    throw new Error("OAUTH_ENCRYPTION_KEY must be 32 bytes (64 hex characters).");
  }
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Encrypt a plaintext string. Returns base64(iv + ciphertext + authTag). */
export async function encryptApiKey(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const result = new Uint8Array(IV_LENGTH + cipherBuf.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(cipherBuf), IV_LENGTH);
  return bytesToBase64(result);
}

/** Decrypt a value produced by encryptApiKey. */
export async function decryptApiKey(key: CryptoKey, ciphertext: string): Promise<string> {
  const data = base64ToBytes(ciphertext);
  if (data.length < IV_LENGTH + 1) {
    throw new Error("Ciphertext too short.");
  }
  const iv = data.slice(0, IV_LENGTH);
  const encrypted = data.slice(IV_LENGTH);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(plainBuf);
}

/** SHA-256 hash of a string, returned as lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a cryptographically random hex string of the given byte length. */
export function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- helpers ---

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, "");
  if (clean.length % 2 !== 0) throw new Error("Invalid hex string.");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
