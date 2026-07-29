-- Duplicate bill detection.
--
-- Two fingerprints, because there are two ways to send the same bill twice and
-- they are caught at different costs.
--
--   pages_hash        sha256 over the per-page sha256s, in order. The same file
--                     re-sent. Checkable before any model call, which is the
--                     only reason to keep it alongside the semantic one.
--
--   bill_fingerprint  sha256 over provider, account number, billing period and
--                     total. The same bill photographed again. Only knowable
--                     after extraction, so it costs one model call to catch.
--
-- Neither column stores an image or anything reversible, so the no-retention
-- policy is unaffected: a hash persists, the page it came from does not.
--
-- Both indexes lead with customer_id and every query does the same. That is a
-- correctness rule, not a performance one. Two tenants of the same building get
-- byte-identical bills from the same landlord, and matching those across
-- customers would both be wrong and reveal that someone else's bill exists.

alter table invoices add column if not exists pages_hash text;
alter table invoices add column if not exists bill_fingerprint text;
alter table invoices add column if not exists duplicate_of_invoice_id text;

-- Deliberately not a foreign key. The row it points at can be deleted by the
-- 7-day retention purge while the pointer's own row is still inside its
-- window, and a cascade there would delete a bill the customer did keep.
-- A dangling id reads as "the original is gone", which is the truth.

create index if not exists invoices_customer_pages_hash_idx
  on invoices (customer_id, pages_hash)
  where pages_hash is not null;

create index if not exists invoices_customer_fingerprint_idx
  on invoices (customer_id, bill_fingerprint)
  where bill_fingerprint is not null;

-- invoices.status gains 'duplicate'. It is a text column with no check
-- constraint, so there is nothing to alter; recorded here so the set of valid
-- statuses stays greppable:
--   collecting | extracting | decoding | guardrail | delivered | failed | duplicate
