/** Central env access — one place to see everything the app needs. */
export const env = {
  get whatsappPhoneNumberId() {
    return required("WHATSAPP_PHONE_NUMBER_ID");
  },
  get whatsappAccessToken() {
    return required("WHATSAPP_ACCESS_TOKEN");
  },
  get whatsappAppSecret() {
    return required("WHATSAPP_APP_SECRET");
  },
  get whatsappVerifyToken() {
    return required("WHATSAPP_VERIFY_TOKEN");
  },
  get summaryJwtSecret() {
    return required("SUMMARY_JWT_SECRET");
  },
  get summaryBaseUrl() {
    return process.env.SUMMARY_BASE_URL ?? process.env.APP_BASE_URL ?? vercelUrl() ?? "http://localhost:3000";
  },
  get appBaseUrl() {
    return process.env.APP_BASE_URL ?? vercelUrl() ?? "http://localhost:3000";
  },
  get qstashToken() {
    return process.env.QSTASH_TOKEN ?? null;
  },
  get waHashPepper() {
    return required("WA_HASH_PEPPER");
  },
};

/** Vercel injects the stable production hostname automatically. */
function vercelUrl(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
