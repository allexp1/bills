import { describe, expect, it } from "vitest";
import { isOverloaded } from "../src/client.js";

/**
 * Its own file, with no vi.mock of the client. split-bills.test.ts replaces
 * that whole module to stub the API call, so anything imported from it there is
 * the stub rather than the real function.
 */
describe("isOverloaded", () => {
  it("recognises a busy service through the layers it arrives wrapped in", () => {
    /* The shape that reached production was the message, not the status: the
       error had crossed enough layers by the time the pipeline saw it that only
       the stringified body survived. Both have to match. */
    expect(isOverloaded({ status: 529 })).toBe(true);
    expect(isOverloaded({ status: 429 })).toBe(true);
    expect(isOverloaded({ status: 503 })).toBe(true);
    expect(
      isOverloaded(
        new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'),
      ),
    ).toBe(true);
    expect(isOverloaded(new Error("rate_limit_error"))).toBe(true);
  });

  it("does not mistake a real failure for a busy service", () => {
    /* Telling someone to wait and try again when the bill will never work is
       its own kind of wrong, so these must stay false. */
    expect(isOverloaded(new Error("invalid_request_error: image too large"))).toBe(false);
    expect(isOverloaded({ status: 401 })).toBe(false);
    expect(isOverloaded(new Error("extraction JSON failed validation after retry"))).toBe(false);
    expect(isOverloaded(null)).toBe(false);
    expect(isOverloaded(undefined)).toBe(false);
  });

  it("does not match a bill total that happens to contain 529", () => {
    /* The digits are word-bounded on purpose. Pipeline errors quote extraction
       detail, and "total 5290" must not read as an overload. */
    expect(isOverloaded(new Error("could not parse total 5290 on page 2"))).toBe(false);
  });
});
