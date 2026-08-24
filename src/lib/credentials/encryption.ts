import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getMasterKey(): Buffer {
  const raw = process.env.PMNTX_MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "PMNTX_MASTER_ENCRYPTION_KEY is not configured. This is a bootstrap " +
        "credential required before any integration credential can be saved " +
        "or decrypted — generate one with `openssl rand -base64 32`."
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `PMNTX_MASTER_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes ` +
        `(got ${key.length}). Generate one with \`openssl rand -base64 32\`.`
    );
  }

  return key;
}

/**
 * Encrypts a plaintext credential value for storage in
 * `integration_credentials.encrypted_value`. Output is a single base64
 * string: iv (12 bytes) + auth tag (16 bytes) + ciphertext, matching the
 * format documented in supabase/migrations/005_integrations.sql.
 */
export function encryptCredential(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Reverses {@link encryptCredential}. Throws if the value has been tampered with. */
export function decryptCredential(encoded: string): string {
  const key = getMasterKey();
  const combined = Buffer.from(encoded, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
