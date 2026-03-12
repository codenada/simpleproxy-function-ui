const CONTROL_PUBLIC_ROOT = "/";
const CONTROL_RESERVED_ROOT = "/_apiproxy";
const CONTROL_ADMIN_ROOT = "/admin";
const CONTROL_REACT_LOGIN_ROOT = "/_login";
const CONTROL_REACT_ADMIN_ROOT = "/_admin";
function readControlEnv(env) {
  return {
    allowedHosts: String(env?.ALLOWED_HOSTS || "").trim(),
    buildVersion: String(env?.BUILD_VERSION || "dev"),
    buildTimestamp: String(env?.BUILD_TIMESTAMP || env?.BUILD_TIME || ""),
  };
}
const CONTROL_ADMIN_PATHS = {
  BROWSER_VERIFY: "/browser-verify",
  SWAGGER_PAGE: "/swagger",
  SWAGGER_SPEC: "/swagger/openapi.json",
  ACCESS_TOKEN: "/access-token",
  VERSION: "/version",
  KEYS: "/keys",
  KEYS_PROXY_ROTATE: "/keys/proxy/rotate",
  KEYS_ISSUER_ROTATE: "/keys/issuer/rotate",
  KEYS_ADMIN_ROTATE: "/keys/admin/rotate",
  CONFIG: "/config",
  CONFIG_TEST_RULE: "/config/test-rule",
  KEY_ROTATION_CONFIG: "/key-rotation-config",
  TRANSFORM_CONFIG: "/transform-config",
  NETWORK_CONTROLS: "/network-controls",
  DEBUG: "/debug",
  DEBUG_LAST: "/debug/last",
  DEBUG_LOGGING_SECRET: "/debug/loggingSecret",
  LIVE_LOG_PAGE: "/live-log",
  LIVE_LOG_STREAM: "/live-log/stream",
  HTTP_AUTH_PREFIX: "/http-auth/",
  HTTP_SECRETS_PREFIX: "/http-secrets/",
  HEADERS: "/headers",
  HEADERS_PREFIX: "/headers/",
};

export {
  CONTROL_PUBLIC_ROOT,
  CONTROL_RESERVED_ROOT,
  CONTROL_ADMIN_ROOT,
  CONTROL_REACT_LOGIN_ROOT,
  CONTROL_REACT_ADMIN_ROOT,
  readControlEnv,
  CONTROL_ADMIN_PATHS,
};
