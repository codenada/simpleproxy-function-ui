import test from "node:test";
import assert from "node:assert/strict";
import { createAdminActivityAuditApi } from "../../src/common/admin_activity_audit.js";

test("appendAdminActivity stores timestamp/ip/action and enforces max entries", async () => {
  const store = new Map();
  const api = createAdminActivityAuditApi({
    ensureKvBinding: () => {},
    dataStore: () => ({
      get: async (k) => (store.has(k) ? store.get(k) : null),
      put: async (k, v) => { store.set(k, v); },
    }),
    loadAdminConfig: () => ({ admin: { admin_activity_log: { max_entries: 2 } } }),
    getClientIp: () => "203.0.113.8",
  });

  const req = new Request("https://example.com/admin/config", { method: "PUT" });
  await api.appendAdminActivity({}, req, "config_update", { changed_keys: [{ key: "a", value: 1 }] });
  await api.appendAdminActivity({}, req, "admin_login", {});
  await api.appendAdminActivity({}, req, "key_rotation", { key_kind: "proxy" });

  const raw = store.get("audit:admin_activity");
  const entries = JSON.parse(raw || "[]");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].action, "key_rotation");
  assert.equal(entries[0].source_ip, "203.0.113.8");
  assert.ok(Number.isFinite(entries[0].ts_ms));
  assert.equal(entries[1].action, "admin_login");
});
