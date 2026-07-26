import { TelegramBotApi, WhatsAppCloudApi, type ChannelAdapter } from "@bills/channel";
import { envKeyring, type Keyring } from "@bills/db";
import { env } from "./env.js";

let adapter: ChannelAdapter | undefined;
let telegramAdapter: ChannelAdapter | undefined;
let keyring: Keyring | undefined;

export function channel(): ChannelAdapter {
  adapter ??= new WhatsAppCloudApi({
    phoneNumberId: env.whatsappPhoneNumberId,
    accessToken: env.whatsappAccessToken,
  });
  return adapter;
}

export function telegram(): TelegramBotApi {
  telegramAdapter ??= new TelegramBotApi({ botToken: env.telegramBotToken });
  return telegramAdapter as TelegramBotApi;
}

/**
 * Multi-channel dispatch: peer ids are namespaced by the webhook parsers
 * ("tg:<chatId>" for Telegram, bare E.164 for WhatsApp), so routing an
 * outbound message is a prefix check.
 */
export function channelFor(peerId: string): ChannelAdapter {
  return peerId.startsWith("tg:") ? telegram() : channel();
}

export function keys(): Keyring {
  keyring ??= envKeyring();
  return keyring;
}

/** Test seam: replace the channel adapters (e.g. with a recording fake). */
export function __setChannelForTests(a: ChannelAdapter | undefined) {
  adapter = a;
  telegramAdapter = a;
}
