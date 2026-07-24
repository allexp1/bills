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
    return process.env.SUMMARY_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
  },
  get appBaseUrl() {
    return process.env.APP_BASE_URL ?? "http://localhost:3000";
  },
  get qstashToken() {
    return process.env.QSTASH_TOKEN ?? null;
  },
  get waHashPepper() {
    return required("WA_HASH_PEPPER");
  },
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
