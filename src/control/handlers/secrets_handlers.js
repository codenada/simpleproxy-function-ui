import {
  HTTP_SECRET_MAX_LENGTH,
  HTTP_SECRET_REFS,
  isValidHttpSecretRef,
  isValidHttpSecretValue,
} from "../../common/auth_profile_keys.js";

function createControlSecretsHandlers(deps) {
  const {
    adminRoot,
    HttpError,
    authProfilePrefix,
    authProfileKvKey,
    authProfileFields,
    httpSecretKvKey,
    enforceInvokeContentType,
    readJsonWithLimit,
    getEnvInt,
    defaults,
    secretStore,
    nowMs,
    jsonResponse,
  } = deps;

  function parseHttpAuthSecretPath(pathname) {
    const base = `${adminRoot}/http-auth/`;
    if (!pathname.startsWith(base)) return null;
    const rest = pathname.slice(base.length);
    const parts = rest.split("/");
    if (parts.length !== 2) return null;
    if (parts[1] !== "secret") return null;
    const profile = decodeURIComponent(parts[0] || "");
    return profile || null;
  }

  function parseHttpAuthSecretByRefPath(pathname) {
    const base = `${adminRoot}/http-auth/`;
    if (!pathname.startsWith(base)) return null;
    const rest = pathname.slice(base.length);
    const parts = rest.split("/");
    if (parts.length !== 3) return null;
    if (parts[1] !== "secrets") return null;
    const profile = decodeURIComponent(parts[0] || "");
    const ref = decodeURIComponent(parts[2] || "").trim();
    if (!profile || !ref) return null;
    return { profile, ref };
  }

  function parseHttpAuthSecretNamesPath(pathname) {
    const base = `${adminRoot}/http-auth/`;
    if (!pathname.startsWith(base)) return null;
    const rest = pathname.slice(base.length);
    const parts = rest.split("/");
    if (parts.length !== 2) return null;
    if (parts[1] !== "secret-names") return null;
    const profile = decodeURIComponent(parts[0] || "");
    return profile || null;
  }

  function profileSecretRefKvKey(profile, ref) {
    const prefix = authProfilePrefix(profile);
    if (!prefix) return null;
    if (!isValidHttpSecretRef(ref)) return null;
    return `${prefix}/${String(ref).trim()}`;
  }

  function profileSecretNameKvKey(profile, ref) {
    const prefix = authProfilePrefix(profile);
    if (!prefix) return null;
    if (!isValidHttpSecretRef(ref)) return null;
    return `${prefix}/${String(ref).trim()}_name`;
  }

  function isValidSecretDisplayName(value) {
    if (value == null) return true;
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.length > 80) return false;
    return !/[\u0000-\u001f\u007f]/.test(trimmed);
  }

  async function handleHttpAuthSecretRoute(pathname, request, env) {
    const namesProfile = parseHttpAuthSecretNamesPath(pathname);
    if (namesProfile) {
      if (!authProfilePrefix(namesProfile)) {
        throw new HttpError(400, "INVALID_REQUEST", "Unsupported auth profile");
      }
      if (request.method === "GET") return await handleHttpAuthSecretNamesGet(namesProfile, env);
      if (request.method === "PUT") return await handleHttpAuthSecretNamesPut(namesProfile, request, env);
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    const secretRefPath = parseHttpAuthSecretByRefPath(pathname);
    if (secretRefPath) {
      const { profile, ref } = secretRefPath;
      if (!authProfilePrefix(profile)) {
        throw new HttpError(400, "INVALID_REQUEST", "Unsupported auth profile");
      }
      if (!isValidHttpSecretRef(ref)) {
        throw new HttpError(400, "INVALID_REQUEST", "Invalid secret reference", {
          allowed_secret_refs: HTTP_SECRET_REFS,
        });
      }
      if (request.method === "GET") return await handleHttpAuthSecretByRefGet(profile, ref, env);
      if (request.method === "PUT") return await handleHttpAuthSecretByRefPut(profile, ref, request, env);
      if (request.method === "DELETE") return await handleHttpAuthSecretByRefDelete(profile, ref, env);
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    const profile = parseHttpAuthSecretPath(pathname);
    if (!profile) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }
    if (!authProfilePrefix(profile)) {
      throw new HttpError(400, "INVALID_REQUEST", "Unsupported auth profile");
    }
    if (request.method === "PUT") return await handleHttpAuthSecretPut(profile, request, env);
    if (request.method === "GET") return await handleHttpAuthSecretGet(profile, env);
    if (request.method === "DELETE") return await handleHttpAuthSecretDelete(profile, env);
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async function handleHttpAuthSecretByRefPut(profile, ref, request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    const value = body?.value;
    if (!isValidHttpSecretValue(value)) {
      throw new HttpError(400, "INVALID_REQUEST", "value is required", {
        expected: {
          value: `non-empty string (max ${HTTP_SECRET_MAX_LENGTH} chars, no control chars)`,
        },
      });
    }
    const key = profileSecretRefKvKey(profile, ref);
    if (!key) {
      throw new HttpError(400, "INVALID_REQUEST", "Invalid auth profile/secret reference");
    }
    await secretStore(env).put(key, String(value));
    return jsonResponse(200, {
      ok: true,
      data: {
        profile,
        secret_ref: ref,
        secret_set: true,
      },
      meta: {},
    });
  }

  async function handleHttpAuthSecretByRefGet(profile, ref, env) {
    const key = profileSecretRefKvKey(profile, ref);
    const nameKey = profileSecretNameKvKey(profile, ref);
    const [secret, nameValue] = await Promise.all([
      key ? secretStore(env).get(key) : null,
      nameKey ? secretStore(env).get(nameKey) : null,
    ]);
    return jsonResponse(200, {
      ok: true,
      data: {
        profile,
        secret_ref: ref,
        secret_set: !!secret,
        name: String(nameValue || "").trim() || null,
      },
      meta: {},
    });
  }

  async function handleHttpAuthSecretByRefDelete(profile, ref, env) {
    const key = profileSecretRefKvKey(profile, ref);
    if (key) await secretStore(env).delete(key);
    return jsonResponse(200, {
      ok: true,
      data: {
        profile,
        secret_ref: ref,
        secret_set: false,
      },
      meta: {},
    });
  }

  async function handleHttpAuthSecretNamesGet(profile, env) {
    const keys = HTTP_SECRET_REFS
      .map((ref) => ({ ref, key: profileSecretNameKvKey(profile, ref) }))
      .filter((entry) => !!entry.key);
    const values = await Promise.all(keys.map((entry) => secretStore(env).get(entry.key)));
    const names = {};
    for (let i = 0; i < keys.length; i += 1) {
      names[keys[i].ref] = String(values[i] || "").trim() || "";
    }
    return jsonResponse(200, {
      ok: true,
      data: {
        profile,
        secret_names: names,
      },
      meta: {},
    });
  }

  async function handleHttpAuthSecretNamesPut(profile, request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    const secret1Name = body?.secret1_name;
    const secret2Name = body?.secret2_name;
    if (!isValidSecretDisplayName(secret1Name) || !isValidSecretDisplayName(secret2Name)) {
      throw new HttpError(400, "INVALID_REQUEST", "Invalid secret display name", {
        expected: {
          secret1_name: "string<=80 chars, no control chars",
          secret2_name: "string<=80 chars, no control chars",
        },
      });
    }
    const writes = [];
    if (secret1Name != null) {
      const key = profileSecretNameKvKey(profile, "secret1");
      if (String(secret1Name).trim()) writes.push(secretStore(env).put(key, String(secret1Name).trim()));
      else writes.push(secretStore(env).delete(key));
    }
    if (secret2Name != null) {
      const key = profileSecretNameKvKey(profile, "secret2");
      if (String(secret2Name).trim()) writes.push(secretStore(env).put(key, String(secret2Name).trim()));
      else writes.push(secretStore(env).delete(key));
    }
    if (writes.length) await Promise.all(writes);
    return await handleHttpAuthSecretNamesGet(profile, env);
  }

  async function handleHttpAuthSecretPut(profile, request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    const value = body?.value;
    if (!isValidHttpSecretValue(value)) {
      throw new HttpError(400, "INVALID_REQUEST", "value is required", {
        expected: {
          value: `non-empty string (max ${HTTP_SECRET_MAX_LENGTH} chars, no control chars)`,
        },
      });
    }
    const secretValue = String(value);
    const key = authProfileKvKey(profile, "current");
    const issuedKey = authProfileKvKey(profile, "issued_at_ms");
    if (key) {
      await Promise.all([
        secretStore(env).put(key, secretValue),
        issuedKey ? secretStore(env).put(issuedKey, String(nowMs())) : Promise.resolve(),
      ]);
    }
    return jsonResponse(200, {
      ok: true,
      data: {
        profile,
        secret_set: true,
      },
      meta: {},
    });
  }

  async function handleHttpAuthSecretGet(profile, env) {
    const key = authProfileKvKey(profile, "current");
    const secret = key ? await secretStore(env).get(key) : null;
    return jsonResponse(200, {
      ok: true,
      data: {
        profile,
        secret_set: !!secret,
      },
      meta: {},
    });
  }

  async function handleHttpAuthSecretDelete(profile, env) {
    const deletes = authProfileFields
      .map((field) => authProfileKvKey(profile, field))
      .filter(Boolean)
      .map((key) => secretStore(env).delete(key));
    if (deletes.length) await Promise.all(deletes);
    return jsonResponse(200, {
      ok: true,
      data: {
        profile,
        secret_set: false,
      },
      meta: {},
    });
  }

  function parseHttpSecretPath(pathname) {
    const base = `${adminRoot}/http-secrets/`;
    if (!pathname.startsWith(base)) return null;
    const rest = pathname.slice(base.length);
    if (!rest || rest.includes("/")) return null;
    const ref = decodeURIComponent(rest || "").trim();
    return ref;
  }

  async function handleHttpSecretRoute(pathname, request, env) {
    const ref = parseHttpSecretPath(pathname);
    if (!ref) {
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    }
    if (!isValidHttpSecretRef(ref)) {
      throw new HttpError(400, "INVALID_REQUEST", "Invalid secret reference", {
        allowed_secret_refs: HTTP_SECRET_REFS,
      });
    }
    if (request.method === "PUT") return await handleHttpSecretPut(ref, request, env);
    if (request.method === "GET") return await handleHttpSecretGet(ref, env);
    if (request.method === "DELETE") return await handleHttpSecretDelete(ref, env);
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  async function handleHttpSecretPut(ref, request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    const value = body?.value;
    if (!isValidHttpSecretValue(value)) {
      throw new HttpError(400, "INVALID_REQUEST", "value is required", {
        expected: {
          value: `non-empty string (max ${HTTP_SECRET_MAX_LENGTH} chars, no control chars)`,
        },
      });
    }
    const key = httpSecretKvKey(ref);
    if (!key) {
      throw new HttpError(400, "INVALID_REQUEST", "Invalid secret reference", {
        allowed_secret_refs: HTTP_SECRET_REFS,
      });
    }
    await secretStore(env).put(key, String(value));
    return jsonResponse(200, {
      ok: true,
      data: {
        secret_ref: ref,
        secret_set: true,
      },
      meta: {},
    });
  }

  async function handleHttpSecretGet(ref, env) {
    const key = httpSecretKvKey(ref);
    const secret = key ? await secretStore(env).get(key) : null;
    return jsonResponse(200, {
      ok: true,
      data: {
        secret_ref: ref,
        secret_set: !!secret,
      },
      meta: {},
    });
  }

  async function handleHttpSecretDelete(ref, env) {
    const key = httpSecretKvKey(ref);
    if (key) await secretStore(env).delete(key);
    return jsonResponse(200, {
      ok: true,
      data: {
        secret_ref: ref,
        secret_set: false,
      },
      meta: {},
    });
  }

  return {
    handleHttpAuthSecretRoute,
    handleHttpSecretRoute,
  };
}

export { createControlSecretsHandlers };
