import assert from "node:assert/strict";
import { test } from "node:test";
import { getServiceClient } from "./service.ts";

test("without the service role key there is no client", () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(getServiceClient(), null);
  } finally {
    if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  }
});
