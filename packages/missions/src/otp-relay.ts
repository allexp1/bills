/**
 * OTP relay: when a provider asks for a verification code, the code the
 * customer replies with is held ONLY in a transient store (5-minute TTL),
 * forwarded verbatim once, and never persisted — transcripts record
 * "[OTP redacted]". Backed by Upstash Redis in production; the in-memory
 * implementation serves tests and local dev.
 */
export interface TransientOtpStore {
  put(missionId: string, code: string): Promise<void>;
  /** Take (read-and-delete). A code can be relayed at most once. */
  take(missionId: string): Promise<string | null>;
}

export const OTP_TTL_MS = 5 * 60 * 1000;

export class InMemoryOtpStore implements TransientOtpStore {
  private readonly entries = new Map<string, { code: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async put(missionId: string, code: string): Promise<void> {
    this.entries.set(missionId, { code, expiresAt: this.now() + OTP_TTL_MS });
  }

  async take(missionId: string): Promise<string | null> {
    const entry = this.entries.get(missionId);
    this.entries.delete(missionId);
    if (!entry || entry.expiresAt < this.now()) return null;
    return entry.code;
  }
}

/** What the transcript stores instead of the code. */
export const OTP_TRANSCRIPT_PLACEHOLDER = "[OTP redacted]";
