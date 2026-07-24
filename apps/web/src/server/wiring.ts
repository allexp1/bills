import { WhatsAppCloudApi, type ChannelAdapter } from "@bills/channel";
import { envKeyring, type Keyring } from "@bills/db";
import { env } from "./env.js";

let adapter: ChannelAdapter | undefined;
let keyring: Keyring | undefined;

export function channel(): ChannelAdapter {
  adapter ??= new WhatsAppCloudApi({
    phoneNumberId: env.whatsappPhoneNumberId,
    accessToken: env.whatsappAccessToken,
  });
  return adapter;
}

export function keys(): Keyring {
  keyring ??= envKeyring();
  return keyring;
}

/** Test seam: replace the channel adapter (e.g. with a recording fake). */
export function __setChannelForTests(a: ChannelAdapter | undefined) {
  adapter = a;
}
