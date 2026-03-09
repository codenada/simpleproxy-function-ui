import adminConfigYaml from "./admin_config.yaml";

const DEFAULT_ADMIN_CONFIG = {
  admin: {
    docs_url: "",
    browser_challenge: {
      enabled: true,
      difficulty: 4,
      challenge_ttl_seconds: 300,
      verified_cookie_ttl_seconds: 600,
    },
  },
};

let cached = null;

function toPositiveInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
}

function normalizeAdminConfig(raw) {
  const merged = {
    admin: {
      ...DEFAULT_ADMIN_CONFIG.admin,
      ...(raw?.admin && typeof raw.admin === "object" ? raw.admin : {}),
      browser_challenge: {
        ...DEFAULT_ADMIN_CONFIG.admin.browser_challenge,
        ...(raw?.admin?.browser_challenge && typeof raw.admin.browser_challenge === "object"
          ? raw.admin.browser_challenge
          : {}),
      },
    },
  };

  merged.admin.browser_challenge.enabled = !!merged.admin.browser_challenge.enabled;
  merged.admin.browser_challenge.difficulty = toPositiveInt(
    merged.admin.browser_challenge.difficulty,
    DEFAULT_ADMIN_CONFIG.admin.browser_challenge.difficulty,
    1,
    6
  );
  merged.admin.browser_challenge.challenge_ttl_seconds = toPositiveInt(
    merged.admin.browser_challenge.challenge_ttl_seconds,
    DEFAULT_ADMIN_CONFIG.admin.browser_challenge.challenge_ttl_seconds,
    30,
    3600
  );
  merged.admin.browser_challenge.verified_cookie_ttl_seconds = toPositiveInt(
    merged.admin.browser_challenge.verified_cookie_ttl_seconds,
    DEFAULT_ADMIN_CONFIG.admin.browser_challenge.verified_cookie_ttl_seconds,
    30,
    86400
  );
  merged.admin.docs_url = String(merged.admin.docs_url || "").trim();
  return merged;
}

function parseSimpleAdminYaml(text) {
  const src = String(text || "");
  const out = {};
  const docs = src.match(/^\s*docs_url:\s*["']?(.+?)["']?\s*$/m);
  if (docs?.[1]) out.docs_url = docs[1].trim();

  function parseField(name) {
    const re = new RegExp(`^\\s*${name}:\\s*([^\\n#]+)`, "m");
    const m = src.match(re);
    if (!m?.[1]) return undefined;
    return String(m[1]).trim().replace(/^["']|["']$/g, "");
  }

  const browser = {};
  const enabledRaw = parseField("enabled");
  if (enabledRaw !== undefined) browser.enabled = /^(true|1|yes)$/i.test(enabledRaw);
  const difficultyRaw = parseField("difficulty");
  if (difficultyRaw !== undefined) browser.difficulty = Number(difficultyRaw);
  const ttlRaw = parseField("challenge_ttl_seconds");
  if (ttlRaw !== undefined) browser.challenge_ttl_seconds = Number(ttlRaw);
  const cookieRaw = parseField("verified_cookie_ttl_seconds");
  if (cookieRaw !== undefined) browser.verified_cookie_ttl_seconds = Number(cookieRaw);

  out.browser_challenge = browser;
  return { admin: out };
}

function loadAdminConfig() {
  if (cached) return cached;
  try {
    const parsed = parseSimpleAdminYaml(adminConfigYaml);
    cached = normalizeAdminConfig(parsed);
  } catch {
    cached = DEFAULT_ADMIN_CONFIG;
  }
  return cached;
}

export { loadAdminConfig, DEFAULT_ADMIN_CONFIG };
