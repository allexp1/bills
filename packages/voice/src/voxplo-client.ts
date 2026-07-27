import { z } from "zod";

/**
 * Thin client for Voxplo, the in-house outbound voice agent. Voxplo is the only
 * supported provider: it is ours, so the disclosure rules, recording policy and
 * walk-away limits below are enforceable end to end rather than delegated to a
 * third party's prompt.
 */

export const CallStatusSchema = z.enum([
  "queued",
  "ringing",
  "in_progress",
  "completed",
  "no_answer",
  "voicemail",
  "declined",
  "failed",
]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const TERMINAL_STATUSES: readonly CallStatus[] = [
  "completed",
  "no_answer",
  "voicemail",
  "declined",
  "failed",
];

export function isTerminal(status: CallStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const TranscriptTurnSchema = z.object({
  role: z.enum(["agent", "callee", "system"]),
  text: z.string(),
  atMs: z.number().int().nonnegative().nullable().default(null),
});
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;

export const CallResultSchema = z.object({
  callId: z.string(),
  status: CallStatusSchema,
  summary: z.string().nullable().default(null),
  transcript: z.array(TranscriptTurnSchema).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
  recordingUrl: z.string().url().nullable().default(null),
  durationSeconds: z.number().int().nonnegative().nullable().default(null),
});
export type CallResult = z.infer<typeof CallResultSchema>;

export interface CallField {
  name: string;
  type?: "string" | "boolean" | "number";
  description?: string;
}

export interface PlaceCallInput {
  /** Destination in E.164, for example +442079460000. */
  to: string;
  objective: string;
  context: string;
  fields?: CallField[];
  callerId?: string;
  accountNumber?: string;
  /** Signed result callback. Set this so we are not polling forever. */
  webhookUrl?: string;
  /**
   * Provider support lines are almost always an IVR, so we stay quiet until
   * the far end speaks and let Voxplo decide between keypad and speech.
   */
  listenFirst?: boolean;
  navMode?: "auto" | "keypad" | "speech";
  toolAllowlist?: string[];
}

export interface VoxploConfig {
  baseUrl: string;
  apiKey: string;
  /** Caller ID presented to the provider. Must be a number on the account. */
  callerId?: string;
  fetchImpl?: typeof fetch;
}

export class VoxploError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "VoxploError";
  }
}

export function voxploConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VoxploConfig {
  const baseUrl = env.VOXPLO_BASE_URL;
  const apiKey = env.VOXPLO_API_KEY;
  if (!baseUrl) throw new VoxploError("VOXPLO_BASE_URL is not set");
  if (!apiKey) throw new VoxploError("VOXPLO_API_KEY is not set");
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    callerId: env.VOXPLO_CALLER_ID,
  };
}

export class VoxploClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: VoxploConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new VoxploError(`Voxplo ${init.method ?? "GET"} ${path} failed`, res.status, text);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new VoxploError(`Voxplo returned non-JSON for ${path}`, res.status, text);
    }
  }

  /** Starts the call and returns immediately. The call runs asynchronously. */
  async placeCall(input: PlaceCallInput): Promise<{ callId: string }> {
    const body = {
      to: input.to,
      objective: input.objective,
      context: input.context,
      fields: input.fields ?? [],
      callerId: input.callerId ?? this.config.callerId,
      accountNumber: input.accountNumber,
      webhookUrl: input.webhookUrl,
      listenFirst: input.listenFirst ?? true,
      navMode: input.navMode ?? "auto",
      toolAllowlist: input.toolAllowlist,
    };

    const json = await this.request("/v1/calls", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const parsed = z.object({ callId: z.string() }).safeParse(json);
    if (!parsed.success) {
      throw new VoxploError("Voxplo place_call response had no callId");
    }
    return parsed.data;
  }

  async getCall(callId: string): Promise<CallResult> {
    const json = await this.request(`/v1/calls/${encodeURIComponent(callId)}`, { method: "GET" });
    const parsed = CallResultSchema.safeParse(json);
    if (!parsed.success) {
      throw new VoxploError(`Voxplo get_call payload did not validate: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  /** Ends an in-flight call. Used by the abort and take over controls. */
  async endCall(callId: string, reason: string): Promise<void> {
    await this.request(`/v1/calls/${encodeURIComponent(callId)}/end`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }
}
