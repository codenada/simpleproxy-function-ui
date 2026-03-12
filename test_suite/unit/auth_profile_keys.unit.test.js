import test from "node:test";
import assert from "node:assert/strict";

import {
  HTTP_SECRET_MAX_LENGTH,
  HTTP_SECRET_REFS,
  authProfilePrefix,
  authProfileKvKey,
  isValidHttpSecretRef,
  isValidHttpSecretValue,
  httpSecretKvKey,
  createAuthProfileKeyResolvers,
} from "../../src/common/auth_profile_keys.js";

const PREFIX_MAP = {
  logging: "auth/logging",
  target: "auth/target",
  jwt_inbound: "auth/jwt_inbound",
};

test("authProfilePrefix resolves known profile names", () => {
  assert.equal(authProfilePrefix("logging", PREFIX_MAP), "auth/logging");
  assert.equal(authProfilePrefix(" target ", PREFIX_MAP), "auth/target");
  assert.equal(authProfilePrefix("unknown", PREFIX_MAP), null);
});

test("authProfileKvKey builds field keys only for supported profiles", () => {
  assert.equal(authProfileKvKey("logging", "current", PREFIX_MAP), "auth/logging/current");
  assert.equal(authProfileKvKey("unknown", "current", PREFIX_MAP), null);
});

test("isValidHttpSecretRef accepts only fixed secret refs", () => {
  assert.equal(isValidHttpSecretRef("secret1"), true);
  assert.equal(isValidHttpSecretRef("secret2"), true);
  assert.equal(isValidHttpSecretRef(""), false);
  assert.equal(isValidHttpSecretRef("secret_3"), false);
  assert.equal(isValidHttpSecretRef("bad value"), false);
});

test("httpSecretKvKey rejects invalid refs and applies prefix", () => {
  assert.equal(httpSecretKvKey("secret1", "http_secret:"), "http_secret:secret1");
  assert.equal(httpSecretKvKey("bad value", "http_secret:"), null);
});

test("isValidHttpSecretValue enforces non-empty safe strings", () => {
  assert.equal(isValidHttpSecretValue("abc123"), true);
  assert.equal(isValidHttpSecretValue(""), false);
  assert.equal(isValidHttpSecretValue("   "), false);
  assert.equal(isValidHttpSecretValue("line1\nline2"), false);
  assert.equal(isValidHttpSecretValue("x".repeat(HTTP_SECRET_MAX_LENGTH + 1)), false);
});

test("createAuthProfileKeyResolvers returns bound helpers", () => {
  const resolvers = createAuthProfileKeyResolvers({
    prefixMap: PREFIX_MAP,
    secretPrefix: "http_secret:",
  });
  assert.equal(resolvers.authProfilePrefix("jwt_inbound"), "auth/jwt_inbound");
  assert.equal(resolvers.authProfileKvKey("target", "expires_at_ms"), "auth/target/expires_at_ms");
  assert.equal(resolvers.httpSecretKvKey(HTTP_SECRET_REFS[0]), "http_secret:secret1");
});
