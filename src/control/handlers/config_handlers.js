function createControlConfigHandlers(deps) {
  const {
    HttpError,
    DEFAULT_CONFIG_V1,
    VALID_TRANSFORM_TYPES,
    isNonArrayObject,
    isPlainObject,
    getStoredContentType,
    looksJson,
    looksYaml,
    normalizeHeaderMap,
    jsonResponse,
    parseYamlConfigText,
    stringifyYamlConfig,
    validateAndNormalizeConfigV1,
    loadConfigV1,
    loadConfigYamlV1,
    saveConfigFromYamlV1,
    saveConfigObjectV1,
    getEnvInt,
    readJsonWithLimit,
    readTextWithLimit,
    enforceInvokeContentType,
    detectResponseType,
    selectTransformRule,
    evalJsonataWithTimeout,
    loadYamlApi,
    defaults,
    onConfigUpdated,
  } = deps;

  function isPlainObjectRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function collectConfigDiffs(before, after, basePath = "", out = []) {
    const currentPath = basePath || "";
    const beforeIsObj = isPlainObjectRecord(before);
    const afterIsObj = isPlainObjectRecord(after);

    if (!beforeIsObj || !afterIsObj) {
      const same = JSON.stringify(before) === JSON.stringify(after);
      if (!same) {
        out.push({
          key: currentPath || "(root)",
          value: after,
        });
      }
      return out;
    }

    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    for (const key of keys) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      collectConfigDiffs(before[key], after[key], nextPath, out);
    }
    return out;
  }

  async function readConfigInputByContentType(request, maxBytes) {
    const contentType = getStoredContentType(request.headers);
    if (looksJson(contentType)) {
      const body = await readJsonWithLimit(request, maxBytes);
      if (!isPlainObject(body)) {
        throw new HttpError(400, "INVALID_CONFIG", "Configuration JSON must be an object");
      }
      return { format: "json", config: validateAndNormalizeConfigV1(body) };
    }
    if (looksYaml(contentType)) {
      const yamlText = await readTextWithLimit(request, maxBytes);
      const normalized = await parseYamlConfigText(yamlText);
      return { format: "yaml", config: normalized, yamlText };
    }
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json or text/yaml");
  }

  async function readNormalizedConfigRequest(request, env) {
    const maxReq = getEnvInt(
      env,
      "MAX_CONFIG_BYTES",
      defaults.MAX_CONFIG_BYTES || defaults.MAX_REQ_BYTES
    );
    return readConfigInputByContentType(request, maxReq);
  }

  function toNullablePositiveInt(raw, field) {
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw new HttpError(400, "INVALID_REQUEST", `${field} must be a positive integer or null`);
    }
    return n;
  }

  async function handleConfigGet(env) {
    const yamlText = await loadConfigYamlV1(env);
    return new Response(yamlText, {
      status: 200,
      headers: { "content-type": "text/yaml; charset=utf-8" },
    });
  }

  async function handleConfigPut(request, env) {
    const existing = await loadConfigV1(env);
    const parsed = await readNormalizedConfigRequest(request, env);
    const normalized =
      parsed.format === "yaml"
        ? await saveConfigFromYamlV1(parsed.yamlText, env)
        : await saveConfigObjectV1(parsed.config, env);

    if (typeof onConfigUpdated === "function") {
      const diffs = collectConfigDiffs(existing, normalized);
      try {
        await onConfigUpdated({ request, env, diffs });
      } catch {
        // best-effort audit log; do not block config save
      }
    }

    return jsonResponse(200, {
      ok: true,
      data: {
        message: "Configuration updated",
        config: normalized,
      },
      meta: {},
    });
  }

  async function handleConfigTestRule(request, env) {
    enforceInvokeContentType(request);
    const maxReq = getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES);
    const body = await readJsonWithLimit(request, maxReq);

    let config;
    if (typeof body?.config_yaml === "string" && body.config_yaml.trim()) {
      config = await parseYamlConfigText(body.config_yaml);
    } else if (body?.config && isNonArrayObject(body.config)) {
      config = validateAndNormalizeConfigV1(body.config);
    } else {
      config = await loadConfigV1(env);
    }

    const sample = body?.response;
    if (!isNonArrayObject(sample)) {
      throw new HttpError(400, "INVALID_REQUEST", "response object is required", {
        expected: {
          response: {
            status: 404,
            headers: { "content-type": "application/json" },
            body: { error: "Not found" },
            type: "json",
          },
        },
      });
    }

    const status = Number(sample.status);
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new HttpError(400, "INVALID_REQUEST", "response.status must be an integer 100-599");
    }

    const headers = normalizeHeaderMap(sample.headers);
    const contentType = headers["content-type"] || "";
    const type = sample.type ? String(sample.type).toLowerCase() : detectResponseType(contentType);
    if (!VALID_TRANSFORM_TYPES.has(type)) {
      throw new HttpError(400, "INVALID_REQUEST", "response.type must be one of json, text, binary, any");
    }

    const ctx = { status, headers, type };
    const targetResponseSection = config?.transform?.target_response || DEFAULT_CONFIG_V1.transform.target_response;
    const { matchedRule, trace } = selectTransformRule(targetResponseSection, ctx);

    let expression = null;
    let source = "none";
    if (matchedRule) {
      expression = matchedRule.expr;
      source = `rule:${matchedRule.name}`;
    }

    let output = null;
    if (expression) {
      try {
        output = await evalJsonataWithTimeout(
          expression,
          { status, headers, body: sample.body },
          getEnvInt(env, "TRANSFORM_TIMEOUT_MS", defaults.TRANSFORM_TIMEOUT_MS)
        );
      } catch (e) {
        throw new HttpError(422, "TRANSFORM_ERROR", "JSONata evaluation failed in test-rule", {
          cause: String(e?.message || e),
        });
      }
    }

    return jsonResponse(200, {
      ok: true,
      data: {
        matched_rule: matchedRule ? matchedRule.name : null,
        expression_source: source,
        output,
        trace,
      },
      meta: {},
    });
  }

  async function handleKeyRotationConfigGet(env) {
    const config = await loadConfigV1(env);
    const section = config?.targetCredentialRotation || DEFAULT_CONFIG_V1.targetCredentialRotation;
    return jsonResponse(200, {
      ok: true,
      data: {
        enabled: !!section.enabled,
        strategy: String(section.strategy || "json_ttl"),
        request_yaml: await stringifyYamlConfig(section.request || {}),
        request: section.request || {},
        key_path: String(section?.response?.key_path || ""),
        ttl_path: section?.response?.ttl_path ?? null,
        ttl_unit: String(section?.response?.ttl_unit || "seconds"),
        expires_at_path: section?.response?.expires_at_path ?? null,
        refresh_skew_seconds: Number(section?.trigger?.refresh_skew_seconds ?? 300),
        retry_once_on_401: !!section?.trigger?.retry_once_on_401,
        proxy_expiry_seconds: config?.apiKeyPolicy?.proxyExpirySeconds ?? null,
        issuer_expiry_seconds: config?.apiKeyPolicy?.issuerExpirySeconds ?? null,
      },
      meta: {},
    });
  }

  async function handleKeyRotationConfigPut(request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    const existing = await loadConfigV1(env);

    let requestObj = null;
    if (isNonArrayObject(body?.request)) {
      requestObj = body.request;
    } else {
      const requestYaml = String(body?.request_yaml || "").trim();
      if (!requestYaml) {
        throw new HttpError(400, "INVALID_REQUEST", "request_yaml or request is required", {
          expected: { request_yaml: "method: POST\\nurl: https://..." },
        });
      }
      try {
        const yaml = await loadYamlApi();
        requestObj = yaml.parse(requestYaml);
      } catch (e) {
        throw new HttpError(400, "INVALID_REQUEST", "request_yaml could not be parsed", {
          cause: String(e?.message || e),
        });
      }
      if (!isNonArrayObject(requestObj)) {
        throw new HttpError(400, "INVALID_REQUEST", "request_yaml must parse to an object");
      }
    }

    const next = {
      ...existing,
      apiKeyPolicy: {
        proxyExpirySeconds: toNullablePositiveInt(body?.proxy_expiry_seconds, "proxy_expiry_seconds"),
        issuerExpirySeconds: toNullablePositiveInt(body?.issuer_expiry_seconds, "issuer_expiry_seconds"),
      },
      targetCredentialRotation: {
        enabled: !!body?.enabled,
        strategy: body?.strategy === "oauth_client_credentials" ? "oauth_client_credentials" : "json_ttl",
        request: requestObj,
        response: {
          key_path: String(body?.key_path || ""),
          ttl_path: body?.ttl_path === "" ? null : body?.ttl_path ?? null,
          ttl_unit: String(body?.ttl_unit || "seconds"),
          expires_at_path: body?.expires_at_path === "" ? null : body?.expires_at_path ?? null,
        },
        trigger: {
          refresh_skew_seconds: Number(body?.refresh_skew_seconds ?? 300),
          retry_once_on_401: !!body?.retry_once_on_401,
        },
      },
    };

    const normalized = await saveConfigObjectV1(next, env);
    return jsonResponse(200, {
      ok: true,
      data: {
        message: "Key rotation configuration updated",
        key_rotation: normalized.targetCredentialRotation,
        api_key_policy: normalized.apiKeyPolicy,
      },
      meta: {},
    });
  }

  function normalizeRequestTemplate(requestIn) {
    if (!isNonArrayObject(requestIn)) {
      throw new HttpError(400, "INVALID_REQUEST", "request must be an object");
    }
    const method = String(requestIn.method || "POST").trim().toUpperCase();
    const url = String(requestIn.url || "").trim();
    const headers = isNonArrayObject(requestIn.headers) ? requestIn.headers : {};
    const bodyType = String(requestIn.body_type || "none").trim().toLowerCase();
    const allowedBodyTypes = new Set(["none", "json", "raw", "urlencoded"]);
    if (!allowedBodyTypes.has(bodyType)) {
      throw new HttpError(400, "INVALID_REQUEST", "request.body_type must be one of none, json, raw, urlencoded");
    }
    const out = {
      method: method || "POST",
      url,
      headers,
      body_type: bodyType,
      body: bodyType === "none" ? {} : (requestIn.body ?? (bodyType === "json" ? {} : "")),
    };
    if (isNonArrayObject(requestIn.authorization)) {
      out.authorization = requestIn.authorization;
    }
    return out;
  }

  function normalizeOptionalString(value) {
    const text = String(value == null ? "" : value).trim();
    return text || null;
  }

  function normalizeOptionalInteger(value, field) {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    if (!Number.isInteger(num)) {
      throw new HttpError(400, "INVALID_REQUEST", `${field} must be an integer or null`);
    }
    return num;
  }

  async function handleJwtConfigGet(env) {
    const config = await loadConfigV1(env);
    const jwt = config?.jwt || {};
    const apiKeyPolicy = config?.apiKeyPolicy || {};
    const jwtInboundTimestampFormat = config?.http_auth?.profiles?.jwt_inbound?.timestamp_format || "epoch_ms";
    return jsonResponse(200, {
      ok: true,
      data: {
        jwt,
        jwt_inbound_timestamp_format: jwtInboundTimestampFormat,
        proxy_expiry_seconds: apiKeyPolicy.proxyExpirySeconds ?? null,
        issuer_expiry_seconds: apiKeyPolicy.issuerExpirySeconds ?? null,
      },
      meta: {},
    });
  }

  async function handleJwtConfigPut(request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    if (!isNonArrayObject(body)) {
      throw new HttpError(400, "INVALID_REQUEST", "Body must be an object");
    }

    const existing = await loadConfigV1(env);
    const existingJwt = isNonArrayObject(existing?.jwt) ? existing.jwt : {};
    const jwtIn = isNonArrayObject(body.jwt) ? body.jwt : {};
    const inboundIn = isNonArrayObject(jwtIn.inbound) ? jwtIn.inbound : {};
    const outboundIn = isNonArrayObject(jwtIn.outbound) ? jwtIn.outbound : {};
    const inboundReq = inboundIn.http_request === null
      ? null
      : (inboundIn.http_request === undefined ? (existingJwt?.inbound?.http_request ?? null) : normalizeRequestTemplate(inboundIn.http_request));
    const jwtNext = {
      enabled: !!jwtIn.enabled,
      inbound: {
        enabled: !!inboundIn.enabled,
        mode: String(inboundIn.mode || "shared_secret"),
        header: String(inboundIn.header || "Authorization"),
        scheme: normalizeOptionalString(inboundIn.scheme),
        issuer: normalizeOptionalString(inboundIn.issuer),
        audience: normalizeOptionalString(inboundIn.audience),
        http_request: inboundReq,
        clock_skew_seconds: normalizeOptionalInteger(inboundIn.clock_skew_seconds, "jwt.inbound.clock_skew_seconds"),
      },
      outbound: {
        enabled: !!outboundIn.enabled,
        header: String(outboundIn.header || "Authorization"),
        scheme: normalizeOptionalString(outboundIn.scheme),
        issuer: normalizeOptionalString(outboundIn.issuer),
        audience: normalizeOptionalString(outboundIn.audience),
        subject: normalizeOptionalString(outboundIn.subject),
        ttl_seconds: normalizeOptionalInteger(outboundIn.ttl_seconds, "jwt.outbound.ttl_seconds"),
      },
      http_request: inboundReq,
      authorization: inboundReq?.authorization || null,
    };
    const nextHttpAuth = isNonArrayObject(existing?.http_auth) ? { ...existing.http_auth } : {};
    const nextProfiles = isNonArrayObject(nextHttpAuth.profiles) ? { ...nextHttpAuth.profiles } : {};
    const jwtInboundProfile = isNonArrayObject(nextProfiles.jwt_inbound) ? { ...nextProfiles.jwt_inbound } : {};
    jwtInboundProfile.timestamp_format = String(body.jwt_inbound_timestamp_format || jwtInboundProfile.timestamp_format || "epoch_ms");
    nextProfiles.jwt_inbound = jwtInboundProfile;
    nextHttpAuth.profiles = nextProfiles;
    const next = {
      ...existing,
      jwt: jwtNext,
      http_auth: nextHttpAuth,
      apiKeyPolicy: {
        proxyExpirySeconds: toNullablePositiveInt(body.proxy_expiry_seconds, "proxy_expiry_seconds"),
        issuerExpirySeconds: toNullablePositiveInt(body.issuer_expiry_seconds, "issuer_expiry_seconds"),
      },
    };
    const normalized = await saveConfigObjectV1(next, env);
    return jsonResponse(200, {
      ok: true,
      data: {
        message: "JWT configuration updated",
        jwt: normalized.jwt,
        api_key_policy: normalized.apiKeyPolicy,
      },
      meta: {},
    });
  }

  function normalizeTransformRuleInput(rule, direction) {
    if (!isNonArrayObject(rule)) return null;
    const out = {
      name: String(rule.name || "").trim(),
      expr: String(rule.expr || ""),
    };
    if (!out.name || !out.expr.trim()) return null;
    if (direction === "target_response") {
      if (Array.isArray(rule.match_status ?? rule.status)) out.match_status = rule.match_status ?? rule.status;
      out.match_type = String(rule.match_type ?? rule.type ?? "any").toLowerCase();
    }
    if (direction === "source_request") {
      if (Array.isArray(rule.match_method ?? rule.method)) {
        out.match_method = (rule.match_method ?? rule.method).map((m) => String(m || "").toUpperCase()).filter(Boolean);
      }
      if (Array.isArray(rule.match_path ?? rule.path)) {
        out.match_path = (rule.match_path ?? rule.path).map((p) => String(p || "")).filter(Boolean);
      }
    }
    if (Array.isArray(rule.match_headers ?? rule.headers)) {
      out.match_headers = (rule.match_headers ?? rule.headers)
        .map((item) => ({ name: String(item?.name || "").toLowerCase(), value: String(item?.value || "") }))
        .filter((item) => item.name && item.value);
    } else if (isNonArrayObject(rule.headerMatch)) {
      out.match_headers = Object.entries(rule.headerMatch)
        .map(([name, value]) => ({ name: String(name || "").toLowerCase(), value: String(value || "") }))
        .filter((item) => item.name && item.value);
    }
    return out;
  }

  async function handleTransformConfigGet(env) {
    const config = await loadConfigV1(env);
    const transform = config?.transform || DEFAULT_CONFIG_V1.transform;
    return jsonResponse(200, {
      ok: true,
      data: {
        source_request: transform.source_request || DEFAULT_CONFIG_V1.transform.source_request,
        target_response: transform.target_response || DEFAULT_CONFIG_V1.transform.target_response,
      },
      meta: {},
    });
  }

  async function handleTransformConfigPut(request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    const existing = await loadConfigV1(env);
    const currentTransform = existing?.transform || DEFAULT_CONFIG_V1.transform;
    const sourceRequestIn = isNonArrayObject(body?.source_request) ? body.source_request : currentTransform.source_request;
    const targetResponseIn = isNonArrayObject(body?.target_response) ? body.target_response : currentTransform.target_response;

    function normalizeRules(rules, direction) {
      if (!Array.isArray(rules)) return [];
      return rules
        .map((rule) => normalizeTransformRuleInput(rule, direction))
        .filter((rule) => rule !== null);
    }

    const sourceRequestRules = normalizeRules(sourceRequestIn?.rules, "source_request");
    const targetResponseRules = normalizeRules(targetResponseIn?.rules, "target_response");
    const next = {
      ...existing,
      transform: {
        source_request: {
          enabled: sourceRequestIn?.enabled === undefined ? !!currentTransform?.source_request?.enabled : !!sourceRequestIn.enabled,
          custom_js_preprocessor: sourceRequestIn?.custom_js_preprocessor === undefined
            ? (currentTransform?.source_request?.custom_js_preprocessor ?? null)
            : (sourceRequestIn.custom_js_preprocessor === null ? null : String(sourceRequestIn.custom_js_preprocessor || "").trim() || null),
          rules: sourceRequestRules,
        },
        target_response: {
          enabled: targetResponseIn?.enabled === undefined ? !!currentTransform?.target_response?.enabled : !!targetResponseIn.enabled,
          custom_js_preprocessor: targetResponseIn?.custom_js_preprocessor === undefined
            ? (currentTransform?.target_response?.custom_js_preprocessor ?? null)
            : (targetResponseIn.custom_js_preprocessor === null ? null : String(targetResponseIn.custom_js_preprocessor || "").trim() || null),
          header_filtering: isPlainObject(targetResponseIn?.header_filtering)
            ? targetResponseIn.header_filtering
            : (currentTransform?.target_response?.header_filtering ?? DEFAULT_CONFIG_V1.transform.target_response.header_filtering),
          rules: targetResponseRules,
        },
      },
    };
    const normalized = await saveConfigObjectV1(next, env);
    return jsonResponse(200, {
      ok: true,
      data: {
        message: "Transform configuration updated",
        transform: normalized.transform,
      },
      meta: {},
    });
  }

  async function handleNetworkControlsGet(env) {
    const config = await loadConfigV1(env);
    const trafficControls = config?.traffic_controls || DEFAULT_CONFIG_V1.traffic_controls;
    return jsonResponse(200, {
      ok: true,
      data: {
        traffic_controls: trafficControls,
      },
      meta: {},
    });
  }

  async function handleNetworkControlsPut(request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    if (!isNonArrayObject(body)) {
      throw new HttpError(400, "INVALID_REQUEST", "Body must be an object");
    }

    const existing = await loadConfigV1(env);
    const currentTrafficControls = existing?.traffic_controls || DEFAULT_CONFIG_V1.traffic_controls;
    const ipFilterIn = isNonArrayObject(body?.ip_filter) ? body.ip_filter : currentTrafficControls.ip_filter;
    const requestRateLimitIn = isNonArrayObject(body?.request_rate_limit)
      ? body.request_rate_limit
      : currentTrafficControls.request_rate_limit;

    let allowedCidrs = currentTrafficControls.ip_filter.allowed_cidrs;
    if (body.ip_filter && !isNonArrayObject(body.ip_filter)) {
      throw new HttpError(400, "INVALID_REQUEST", "ip_filter must be an object");
    }
    if (isNonArrayObject(body.ip_filter) && body.ip_filter.allowed_cidrs !== undefined) {
      if (!Array.isArray(body.ip_filter.allowed_cidrs)) {
        throw new HttpError(400, "INVALID_REQUEST", "ip_filter.allowed_cidrs must be an array");
      }
      const normalizedCidrs = body.ip_filter.allowed_cidrs
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      allowedCidrs = normalizedCidrs.length ? normalizedCidrs : ["0.0.0.0/0", "::/0"];
    }

    let rpmRateLimit = currentTrafficControls.request_rate_limit.rpm_rate_limit;
    if (body.request_rate_limit && !isNonArrayObject(body.request_rate_limit)) {
      throw new HttpError(400, "INVALID_REQUEST", "request_rate_limit must be an object");
    }
    if (isNonArrayObject(body.request_rate_limit) && body.request_rate_limit.rpm_rate_limit !== undefined) {
      const candidate = Number(body.request_rate_limit.rpm_rate_limit);
      if (!Number.isInteger(candidate) || candidate < 1) {
        throw new HttpError(400, "INVALID_REQUEST", "request_rate_limit.rpm_rate_limit must be an integer >= 1");
      }
      rpmRateLimit = candidate;
    }

    const next = {
      ...existing,
      traffic_controls: {
        ip_filter: {
          enabled: !!ipFilterIn?.enabled,
          allowed_cidrs: allowedCidrs,
        },
        request_rate_limit: {
          enabled: !!requestRateLimitIn?.enabled,
          rpm_rate_limit: rpmRateLimit,
        },
      },
    };
    const normalized = await saveConfigObjectV1(next, env);
    return jsonResponse(200, {
      ok: true,
      data: {
        message: "Network controls updated",
        traffic_controls: normalized.traffic_controls,
      },
      meta: {},
    });
  }

  async function handleLoggingConfigGet(env) {
    const config = await loadConfigV1(env);
    const endpointRequest = config?.debug?.loggingEndpoint?.http_request || null;
    const tsFormat = config?.http_auth?.profiles?.logging?.timestamp_format || "epoch_ms";
    return jsonResponse(200, {
      ok: true,
      data: {
        enabled: !!(endpointRequest && endpointRequest.url),
        request: endpointRequest,
        timestamp_format: tsFormat,
      },
      meta: {},
    });
  }

  async function handleLoggingConfigPut(request, env) {
    enforceInvokeContentType(request);
    const body = await readJsonWithLimit(request, getEnvInt(env, "MAX_REQ_BYTES", defaults.MAX_REQ_BYTES));
    if (!isNonArrayObject(body)) {
      throw new HttpError(400, "INVALID_REQUEST", "Body must be an object");
    }
    const enabled = !!body.enabled;
    const existing = await loadConfigV1(env);
    const nextDebug = isNonArrayObject(existing?.debug) ? { ...existing.debug } : {};
    const requestTemplate = enabled ? normalizeRequestTemplate(body.request) : null;
    nextDebug.loggingEndpoint = {
      ...(isNonArrayObject(nextDebug.loggingEndpoint) ? nextDebug.loggingEndpoint : {}),
      http_request: requestTemplate,
    };

    const nextHttpAuth = isNonArrayObject(existing?.http_auth) ? { ...existing.http_auth } : {};
    const nextProfiles = isNonArrayObject(nextHttpAuth.profiles) ? { ...nextHttpAuth.profiles } : {};
    const loggingProfile = isNonArrayObject(nextProfiles.logging) ? { ...nextProfiles.logging } : {};
    loggingProfile.timestamp_format = String(body.timestamp_format || loggingProfile.timestamp_format || "epoch_ms");
    nextProfiles.logging = loggingProfile;
    nextHttpAuth.profiles = nextProfiles;

    const normalized = await saveConfigObjectV1({
      ...existing,
      debug: nextDebug,
      http_auth: nextHttpAuth,
    }, env);
    return jsonResponse(200, {
      ok: true,
      data: {
        message: "Logging configuration updated",
        enabled: !!(normalized?.debug?.loggingEndpoint?.http_request?.url),
      },
      meta: {},
    });
  }

  return {
    handleConfigGet,
    handleConfigPut,
    handleConfigTestRule,
    handleKeyRotationConfigGet,
    handleKeyRotationConfigPut,
    handleJwtConfigGet,
    handleJwtConfigPut,
    handleTransformConfigGet,
    handleTransformConfigPut,
    handleNetworkControlsGet,
    handleNetworkControlsPut,
    handleLoggingConfigGet,
    handleLoggingConfigPut,
  };
}

export { createControlConfigHandlers };
