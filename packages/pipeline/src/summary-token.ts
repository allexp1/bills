import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed summary-link tokens: compact HS256 JWT minted per delivered bill.
 * The DB stores sha256(jti) so links can be revoked (e.g. on data deletion)
 * without storing the token itself.
 */

export interface SummaryTokenClaims {
  jti: string;
  inv: string; // invoice id
  exp: number; // unix seconds
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function mintSummaryToken(
  invoiceId: string,
  secret: string,
  ttlSeconds = 7 * 24 * 3600,
  now = Date.now(),
): { token: string; jti: string; tokenHash: string; expiresAt: Date } {
  const jti = randomBytes(16).toString("hex");
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(Buffer.from(JSON.stringify({ jti, inv: invoiceId, exp } satisfies SummaryTokenClaims)));
  const sig = b64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return {
    token: `${header}.${payload}.${sig}`,
    jti,
    tokenHash: createHash("sha256").update(jti).digest("hex"),
    expiresAt: new Date(exp * 1000),
  };
}

export type VerifyResult =
  | { ok: true; claims: SummaryTokenClaims; tokenHash: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifySummaryToken(token: string, secret: string, now = Date.now()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [header, payload, sig] = parts as [string, string, string];
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  let claims: SummaryTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!claims.jti || !claims.inv || typeof claims.exp !== "number") return { ok: false, reason: "malformed" };
  if (claims.exp * 1000 < now) return { ok: false, reason: "expired" };
  return { ok: true, claims, tokenHash: createHash("sha256").update(claims.jti).digest("hex") };
}
