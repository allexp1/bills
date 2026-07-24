import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID: 48-bit timestamp + 80 bits of randomness, Crockford base32, 26 chars. */
export function ulid(now: number = Date.now()): string {
  let ts = now;
  const time = new Array<string>(10);
  for (let i = 9; i >= 0; i--) {
    time[i] = CROCKFORD[ts % 32]!;
    ts = Math.floor(ts / 32);
  }
  const rand = randomBytes(16);
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const byte of rand) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 16) {
      out += CROCKFORD[(acc >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
    if (out.length === 16) break;
  }
  return time.join("") + out;
}

export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
