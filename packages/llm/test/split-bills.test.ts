import { describe, expect, it, vi, beforeEach } from "vitest";

/* The model call is mocked. What is worth testing here is not whether a model
   groups pages well, it is whether a bad answer can lose or duplicate somebody's
   bill. Every branch below is a way the answer can be wrong. */
const create = vi.fn();
vi.mock("../src/client.js", () => ({
  MODEL: "test-model",
  SPLIT_MODEL: "test-split-model",
  anthropic: () => ({ messages: { create } }),
  usageFrom: () => ({
    inputTokens: 1,
    outputTokens: 1,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }),
}));

const { splitBills } = await import("../src/split-bills.js");

const page = (n: number) => ({ data: Buffer.from(`page-${n}`), mimeType: "image/jpeg" });
const reply = (obj: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(obj) }],
  usage: { input_tokens: 1, output_tokens: 1 },
});

beforeEach(() => create.mockReset());

describe("splitBills", () => {
  it("does not call the model for a single page", async () => {
    const r = await splitBills([page(1)]);
    expect(create).not.toHaveBeenCalled();
    expect(r.consulted).toBe(false);
    expect(r.groups).toEqual([{ pageIndices: [0], providerHint: null }]);
  });

  it("splits pages into the groups the model reports", async () => {
    create.mockResolvedValue(
      reply({
        bills: [
          { pages: [1, 2], providerName: "Pelephone" },
          { pages: [3], providerName: "Iberdrola" },
        ],
      }),
    );
    const r = await splitBills([page(1), page(2), page(3)]);
    expect(r.groups).toEqual([
      { pageIndices: [0, 1], providerHint: "Pelephone" },
      { pageIndices: [2], providerHint: "Iberdrola" },
    ]);
  });

  it("falls back to one bill when a page would be lost", async () => {
    /* Page 3 never appears. Trusting this would silently delete a third of
       someone's bill, so the whole answer is discarded. */
    create.mockResolvedValue(reply({ bills: [{ pages: [1, 2], providerName: null }] }));
    const r = await splitBills([page(1), page(2), page(3)]);
    expect(r.groups).toEqual([{ pageIndices: [0, 1, 2], providerHint: null }]);
  });

  it("falls back to one bill when a page would be counted twice", async () => {
    create.mockResolvedValue(
      reply({
        bills: [
          { pages: [1, 2], providerName: null },
          { pages: [2], providerName: null },
        ],
      }),
    );
    const r = await splitBills([page(1), page(2)]);
    expect(r.groups).toEqual([{ pageIndices: [0, 1], providerHint: null }]);
  });

  it("falls back to one bill on a malformed answer", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "I think there are two bills here." }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const r = await splitBills([page(1), page(2)]);
    expect(r.groups).toEqual([{ pageIndices: [0, 1], providerHint: null }]);
  });

  it("falls back to one bill when the response is not the shape it expects", async () => {
    /* Stands in for the whole outer catch: a wrong SPLIT_MODEL id, an API
       error, a response the SDK shapes differently after an upgrade. The mock
       returns a malformed response rather than throwing, because vitest fails a
       test whenever a mock throws even when the code under test catches it, and
       the point here is the code's behaviour rather than the runner's.

       The behaviour that matters: an upload still gets analysed. A splitter
       that can take the whole feature down with it is worse than no splitter. */
    create.mockResolvedValue({ content: null, usage: { input_tokens: 1, output_tokens: 1 } });
    const r = await splitBills([page(1), page(2)]);
    expect(r.groups).toEqual([{ pageIndices: [0, 1], providerHint: null }]);
  });

  it("ignores page numbers outside the upload", async () => {
    create.mockResolvedValue(
      reply({
        bills: [
          { pages: [1, 99], providerName: null },
          { pages: [2], providerName: null },
        ],
      }),
    );
    /* 99 is dropped as out of range, which leaves page 1 and page 2 covered
       exactly once, so the split still stands. */
    const r = await splitBills([page(1), page(2)]);
    expect(r.groups).toEqual([
      { pageIndices: [0], providerHint: null },
      { pageIndices: [1], providerHint: null },
    ]);
  });
});
