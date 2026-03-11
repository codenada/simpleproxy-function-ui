function createAdminActivityAuditApi({
  ensureKvBinding,
  dataStore,
  loadAdminConfig,
  getClientIp,
}) {
  const ADMIN_ACTIVITY_AUDIT_KV_KEY = "audit:admin_activity";
  const DEFAULT_MAX_ENTRIES = 1000;

  function getMaxEntries() {
    const cfg = loadAdminConfig?.() || {};
    const raw = Number(cfg?.admin?.admin_activity_log?.max_entries ?? DEFAULT_MAX_ENTRIES);
    if (!Number.isFinite(raw)) return DEFAULT_MAX_ENTRIES;
    return Math.max(1, Math.floor(raw));
  }

  async function appendAdminActivity(env, request, action, details = {}) {
    ensureKvBinding(env);
    const kv = dataStore(env);
    const key = ADMIN_ACTIVITY_AUDIT_KV_KEY;
    let existing = [];
    try {
      const raw = await kv.get(key);
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      existing = [];
    }

    const entry = {
      ts_ms: Date.now(),
      source_ip: getClientIp(request),
      action: String(action || "unknown"),
      details: details && typeof details === "object" ? details : {},
    };
    const next = [entry, ...existing].slice(0, getMaxEntries());
    await kv.put(key, JSON.stringify(next));
  }

  return {
    appendAdminActivity,
  };
}

export { createAdminActivityAuditApi };
