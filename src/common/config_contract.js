// Human-readable config validation contract for incoming runtime config.
// Keep this file in sync with config surface changes.

const CONFIG_CONTRACT_VERSION = "2026-03-11";

const CONFIG_CONTRACT_ROWS = [
  { path: "$.proxyName", type: "string|null", constraints: "nullable; if set, must be a string" },
  { path: "$.http_requests", type: "object", constraints: "map of request-name => request object" },
  { path: "$.http_requests.<name>.method", type: "string", constraints: "HTTP method token (e.g. GET, POST)" },
  { path: "$.http_requests.<name>.url", type: "string|null", constraints: "if set, valid https URL" },
  { path: "$.http_requests.<name>.headers", type: "object|array", constraints: "object or [{name,value}] with string values" },
  { path: "$.http_requests.<name>.body_type", type: "string", constraints: "none|json|urlencoded|raw" },
  { path: "$.http_requests.<name>.auth_profile", type: "string|null", constraints: "supported profile name when set" },
  { path: "$.http_requests.<name>.security.require_https", type: "boolean", constraints: "true|false" },
  { path: "$.http_requests.<name>.security.block_private_networks", type: "boolean", constraints: "true|false" },
  { path: "$.http_requests.<name>.security.method_allowlist", type: "array", constraints: "array of non-empty method strings" },
  { path: "$.http_requests.<name>.security.timeout_ms", type: "integer|null", constraints: "positive integer or null" },
  { path: "$.http_requests.<name>.security.max_response_bytes", type: "integer|null", constraints: "positive integer or null" },
  { path: "$.http_requests.<name>.security.allowed_hosts", type: "array", constraints: "array of non-empty host strings" },
  { path: "$.http_requests.<name>.http_authorization.type", type: "string", constraints: "static|key_rotation" },
  { path: "$.http_requests.<name>.http_authorization.static.headers", type: "object", constraints: "header values must be strings" },
  { path: "$.http_requests.<name>.http_authorization.static.secret_ref", type: "string|null", constraints: "if set, must be one of secret1|secret2" },
  { path: "$.http_requests.<name>.http_authorization.key_rotation.profile", type: "string|null", constraints: "supported profile name" },
  { path: "$.http_requests.<name>.http_authorization.key_rotation.auth_headers", type: "object|array", constraints: "object or [{name,value}] with string values" },
  { path: "$.http_requests.<name>.http_authorization.key_rotation.key_rotation_http_response", type: "object", constraints: "values must be strings" },
  { path: "$.http_auth.profiles", type: "object", constraints: "supported profiles only: target, logging, jwt_inbound" },
  { path: "$.http_auth.profiles.<name>.headers", type: "object", constraints: "header values should be strings" },
  { path: "$.http_auth.profiles.<name>.timestamp_format", type: "string", constraints: "epoch_ms|epoch_seconds|iso_8601" },
  { path: "$.jwt.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.jwt.inbound.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.jwt.inbound.mode", type: "string", constraints: "shared_secret|jwks" },
  { path: "$.jwt.inbound.header", type: "string", constraints: "non-empty header name" },
  { path: "$.jwt.inbound.scheme", type: "string|null", constraints: "nullable" },
  { path: "$.jwt.inbound.issuer", type: "string|null", constraints: "nullable" },
  { path: "$.jwt.inbound.audience", type: "string|null", constraints: "nullable" },
  { path: "$.jwt.inbound.clock_skew_seconds", type: "integer", constraints: "integer >= 0" },
  { path: "$.jwt.outbound.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.jwt.outbound.header", type: "string", constraints: "non-empty header name" },
  { path: "$.jwt.outbound.scheme", type: "string|null", constraints: "nullable" },
  { path: "$.jwt.outbound.issuer", type: "string|null", constraints: "nullable" },
  { path: "$.jwt.outbound.audience", type: "string|null", constraints: "nullable" },
  { path: "$.jwt.outbound.subject", type: "string|null", constraints: "nullable" },
  { path: "$.jwt.outbound.ttl_seconds", type: "integer|null", constraints: "positive integer or null" },
  { path: "$.apiKeyPolicy.proxyExpirySeconds", type: "integer|null", constraints: "positive integer or null" },
  { path: "$.apiKeyPolicy.issuerExpirySeconds", type: "integer|null", constraints: "positive integer or null" },
  { path: "$.targetCredentialRotation.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.targetCredentialRotation.strategy", type: "string", constraints: "json_ttl|oauth_client_credentials" },
  { path: "$.targetCredentialRotation.request", type: "object", constraints: "valid request object" },
  { path: "$.targetCredentialRotation.response.key_path", type: "string", constraints: "non-empty" },
  { path: "$.targetCredentialRotation.response.ttl_path", type: "string|null", constraints: "nullable" },
  { path: "$.targetCredentialRotation.response.expires_at_path", type: "string|null", constraints: "nullable" },
  { path: "$.targetCredentialRotation.response.ttl_unit", type: "string", constraints: "seconds|minutes|hours" },
  { path: "$.targetCredentialRotation.response", type: "rule", constraints: "must define ttl_path or expires_at_path" },
  { path: "$.targetCredentialRotation.trigger.refresh_skew_seconds", type: "integer", constraints: "integer >= 0" },
  { path: "$.targetCredentialRotation.trigger.retry_once_on_401", type: "boolean", constraints: "true|false" },
  { path: "$.debug.max_debug_session_seconds", type: "integer", constraints: "1..604800" },
  { path: "$.debug.loggingEndpoint.http_request", type: "object|null", constraints: "valid request object or null" },
  { path: "$.transform.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.transform.source_request.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.transform.source_request.custom_js_preprocessor", type: "string|null", constraints: "nullable" },
  { path: "$.transform.source_request.defaultExpr", type: "string", constraints: "string expression" },
  { path: "$.transform.source_request.fallback", type: "string", constraints: "passthrough|error|transform_default" },
  { path: "$.transform.source_request.rules", type: "array", constraints: "array of valid transform rules" },
  { path: "$.transform.target_response.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.transform.target_response.custom_js_preprocessor", type: "string|null", constraints: "nullable" },
  { path: "$.transform.target_response.defaultExpr", type: "string", constraints: "string expression" },
  { path: "$.transform.target_response.fallback", type: "string", constraints: "passthrough|error|transform_default" },
  { path: "$.transform.target_response.header_filtering.mode", type: "string", constraints: "blacklist|whitelist" },
  { path: "$.transform.target_response.header_filtering.names", type: "array", constraints: "array of header names" },
  { path: "$.transform.target_response.rules", type: "array", constraints: "array of valid transform rules" },
  { path: "$.header_forwarding.mode", type: "string", constraints: "blacklist|whitelist" },
  { path: "$.header_forwarding.names", type: "array", constraints: "array of non-empty header names" },
  { path: "$.traffic_controls.ip_filter.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.traffic_controls.ip_filter.allowed_cidrs", type: "array", constraints: "array of non-empty CIDR strings" },
  { path: "$.traffic_controls.request_rate_limit.enabled", type: "boolean", constraints: "true|false" },
  { path: "$.traffic_controls.request_rate_limit.rpm_rate_limit", type: "integer", constraints: "integer >= 1" },
];

const CONTRACT_BY_PATH = new Map(CONFIG_CONTRACT_ROWS.map((row) => [row.path, row]));

function normalizeContractPath(path) {
  let p = String(path || "");
  p = p.replace(/\[\d+\]/g, "[*]");
  p = p.replace(/\.http_requests\.[^.]+/g, ".http_requests.<name>");
  p = p.replace(/\.profiles\.[^.]+/g, ".profiles.<name>");
  p = p.replace(/\.rules\[\*\]/g, ".rules");
  return p;
}

function lookupConfigConstraint(path) {
  const normalized = normalizeContractPath(path);
  return CONTRACT_BY_PATH.get(normalized) || null;
}

export {
  CONFIG_CONTRACT_VERSION,
  CONFIG_CONTRACT_ROWS,
  lookupConfigConstraint,
};
