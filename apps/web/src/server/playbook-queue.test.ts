import { describe, expect, it } from "vitest";
import { isGlobalOutage } from "./playbook-queue.js";

describe("isGlobalOutage", () => {
  it("treats an exhausted credit balance as an outage, not a bad market", () => {
    // The real one: this drained 4 markets' attempts before it was caught.
    expect(
      isGlobalOutage(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
      ),
    ).toBe(true);
  });

  it("covers the other ways the API goes away", () => {
    expect(isGlobalOutage("429 rate_limit_error")).toBe(true);
    expect(isGlobalOutage("529 overloaded_error")).toBe(true);
    expect(isGlobalOutage("500 internal server error")).toBe(true);
    expect(isGlobalOutage("request timeout")).toBe(true);
  });

  it("a market that genuinely cannot be researched still burns an attempt", () => {
    expect(isGlobalOutage("invalid_playbook: levers.0.id: Invalid")).toBe(false);
    expect(isGlobalOutage("no JSON object in the reply")).toBe(false);
    expect(isGlobalOutage(undefined)).toBe(false);
  });
});
