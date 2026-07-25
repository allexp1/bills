import { z } from "zod";

/**
 * Wire-schema transform for structured outputs.
 *
 * The Anthropic structured-outputs compiler limits a schema to 16 union-typed
 * parameters, and every `.nullable()` is a union. Our domain schemas make
 * every leaf nullable ("never guess — return null"), which is far over the
 * limit. So the WIRE schema replaces leaf nullables with sentinel values and
 * `normalizeWireData` converts them back to nulls, keeping the domain model
 * (and every consumer: packs, guardrails, DB, UI) unchanged.
 *
 * Rules:
 *   nullable(string)  → string,  ""        → null
 *   nullable(number)  → number,  0         → null   (only used for page indexes, 1-based)
 *   nullable(enum)    → enum + "unknown",  "unknown" → null
 *   nullable(boolean) → enum ["true","false","unknown"] → true/false/null
 *   nullable(record)  → record (empty allowed)
 *   nullable(object)  → stays nullable    (top-level pack objects; few enough to fit)
 */
export function toWireSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodNullable) {
    const inner = schema.unwrap() as z.ZodTypeAny;
    if (inner instanceof z.ZodString) return z.string();
    if (inner instanceof z.ZodNumber) return z.number();
    if (inner instanceof z.ZodEnum) {
      const options = (inner.options as string[]).filter((o) => o !== "unknown");
      return z.enum([...options, "unknown"]);
    }
    if (inner instanceof z.ZodBoolean) return z.enum(["true", "false", "unknown"]);
    if (inner instanceof z.ZodRecord) return toWireSchema(inner);
    if (inner instanceof z.ZodObject) return (toWireSchema(inner) as z.ZodObject<z.ZodRawShape>).nullable();
    return schema;
  }
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(schema.shape)) {
      shape[key] = toWireSchema(value as z.ZodTypeAny);
    }
    return z.object(shape);
  }
  if (schema instanceof z.ZodArray) {
    return z.array(toWireSchema(schema.element as z.ZodTypeAny));
  }
  if (schema instanceof z.ZodRecord) {
    return z.record(z.string(), z.number());
  }
  return schema;
}

/** Convert wire data (sentinels) back into the domain shape (nulls). */
export function normalizeWireData(domainSchema: z.ZodTypeAny, value: unknown): unknown {
  if (domainSchema instanceof z.ZodNullable) {
    const inner = domainSchema.unwrap() as z.ZodTypeAny;
    if (value === null) return null;
    if (inner instanceof z.ZodString) return value === "" ? null : value;
    if (inner instanceof z.ZodNumber) return value === 0 ? null : value;
    if (inner instanceof z.ZodEnum) return value === "unknown" ? null : value;
    if (inner instanceof z.ZodBoolean) {
      if (value === "unknown") return null;
      return value === "true" || value === true;
    }
    if (inner instanceof z.ZodObject) return normalizeWireData(inner, value);
    return value;
  }
  if (domainSchema instanceof z.ZodObject && value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(domainSchema.shape)) {
      out[key] = normalizeWireData(child as z.ZodTypeAny, (value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (domainSchema instanceof z.ZodArray && Array.isArray(value)) {
    return value.map((item) => normalizeWireData(domainSchema.element as z.ZodTypeAny, item));
  }
  return value;
}

/** Count union-typed parameters in a JSON schema (the API's constrained resource). */
export function countUnionParameters(schema: z.ZodTypeAny): number {
  const json = JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" }));
  const anyOf = (json.match(/"anyOf"/g) ?? []).length;
  const typeArrays = (json.match(/"type":\s*\[/g) ?? []).length;
  return anyOf + typeArrays;
}
