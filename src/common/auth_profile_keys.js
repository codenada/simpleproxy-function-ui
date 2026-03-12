const HTTP_SECRET_REFS = Object.freeze(["secret1", "secret2"]);
const HTTP_SECRET_REF_SET = new Set(HTTP_SECRET_REFS);
const HTTP_SECRET_MAX_LENGTH = 4096;

function authProfilePrefix(name, prefixMap) {
  const key = String(name || "").trim();
  return prefixMap?.[key] || null;
}

function authProfileKvKey(profile, field, prefixMap) {
  const prefix = authProfilePrefix(profile, prefixMap);
  if (!prefix) return null;
  return `${prefix}/${field}`;
}

function isValidHttpSecretRef(ref) {
  return HTTP_SECRET_REF_SET.has(String(ref || "").trim());
}

function isValidHttpSecretValue(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (value.length > HTTP_SECRET_MAX_LENGTH) return false;
  // Reject control chars to prevent header/body injection vectors.
  return !/[\u0000-\u001f\u007f]/.test(value);
}

function httpSecretKvKey(ref, prefix = "http_secret/") {
  const key = String(ref || "").trim();
  if (!isValidHttpSecretRef(key)) return null;
  return `${prefix}${key}`;
}

function createAuthProfileKeyResolvers({ prefixMap, secretPrefix }) {
  return {
    authProfilePrefix: (name) => authProfilePrefix(name, prefixMap),
    authProfileKvKey: (profile, field) => authProfileKvKey(profile, field, prefixMap),
    httpSecretKvKey: (ref) => httpSecretKvKey(ref, secretPrefix),
  };
}

export {
  authProfilePrefix,
  authProfileKvKey,
  isValidHttpSecretRef,
  isValidHttpSecretValue,
  httpSecretKvKey,
  HTTP_SECRET_REFS,
  HTTP_SECRET_MAX_LENGTH,
  createAuthProfileKeyResolvers,
};
