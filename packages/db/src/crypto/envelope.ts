import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level envelope encryption.
 *
 * Every sensitive value is encrypted with a fresh per-value AES-256-GCM data
 * key (DEK); the DEK itself is wrapped by the master key (KEK) referenced by
 * `kekId`, so KEK rotation only requires re-wrapping DEKs, not re-encrypting
 * data. In dev the KEK comes from ENVELOPE_KEK_BASE64; in prod from KMS.
 */

export interface EnvelopeCiphertext {
  v: 1;
  kekId: string;
  wrappedDek: string; // base64: iv || ciphertext || tag of the DEK under the KEK
  iv: string; // base64, data iv
  ct: string; // base64, data ciphertext
  tag: string; // base64, data auth tag
}

export interface Keyring {
  kekId: string;
  getKek(kekId: string): Buffer; // throws on unknown id
}

export function envKeyring(env: NodeJS.ProcessEnv = process.env): Keyring {
  const b64 = env.ENVELOPE_KEK_BASE64;
  if (!b64) throw new Error("ENVELOPE_KEK_BASE64 is not set");
  const kek = Buffer.from(b64, "base64");
  if (kek.length !== 32) throw new Error("ENVELOPE_KEK_BASE64 must decode to 32 bytes");
  const kekId = env.ENVELOPE_KEK_ID ?? "default";
  return {
    kekId,
    getKek(id) {
      if (id !== kekId) throw new Error(`Unknown KEK id: ${id}`);
      return kek;
    },
  };
}

function aeadEncrypt(key: Buffer, plaintext: Buffer): { iv: Buffer; ct: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ct, tag: cipher.getAuthTag() };
}

function aeadDecrypt(key: Buffer, iv: Buffer, ct: Buffer, tag: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export function encryptEnvelope(keyring: Keyring, plaintext: Buffer): EnvelopeCiphertext {
  const dek = randomBytes(32);
  const data = aeadEncrypt(dek, plaintext);
  const wrapped = aeadEncrypt(keyring.getKek(keyring.kekId), dek);
  return {
    v: 1,
    kekId: keyring.kekId,
    wrappedDek: Buffer.concat([wrapped.iv, wrapped.ct, wrapped.tag]).toString("base64"),
    iv: data.iv.toString("base64"),
    ct: data.ct.toString("base64"),
    tag: data.tag.toString("base64"),
  };
}

export function decryptEnvelope(keyring: Keyring, env: EnvelopeCiphertext): Buffer {
  const wrapped = Buffer.from(env.wrappedDek, "base64");
  const dek = aeadDecrypt(
    keyring.getKek(env.kekId),
    wrapped.subarray(0, 12),
    wrapped.subarray(12, wrapped.length - 16),
    wrapped.subarray(wrapped.length - 16),
  );
  return aeadDecrypt(
    dek,
    Buffer.from(env.iv, "base64"),
    Buffer.from(env.ct, "base64"),
    Buffer.from(env.tag, "base64"),
  );
}

export function encryptJson<T>(keyring: Keyring, value: T): Buffer {
  return Buffer.from(JSON.stringify(encryptEnvelope(keyring, Buffer.from(JSON.stringify(value), "utf8"))));
}

export function decryptJson<T>(keyring: Keyring, stored: Buffer | string): T {
  const env = JSON.parse(stored.toString()) as EnvelopeCiphertext;
  return JSON.parse(decryptEnvelope(keyring, env).toString("utf8")) as T;
}

export function encryptText(keyring: Keyring, value: string): Buffer {
  return Buffer.from(JSON.stringify(encryptEnvelope(keyring, Buffer.from(value, "utf8"))));
}

export function decryptText(keyring: Keyring, stored: Buffer | string): string {
  const env = JSON.parse(stored.toString()) as EnvelopeCiphertext;
  return decryptEnvelope(keyring, env).toString("utf8");
}
