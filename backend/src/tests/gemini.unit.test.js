// Gemini service: error classification, health caching, and configuration (mocked transport, no network).
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const svc = await import("../services/geminiService.js");
const translation = await import("../services/translation.service.js");
const aiCtl = await import("../controllers/ai.controller.js");
const { chatWithAI, normalizeHistory } = aiCtl;

const FAKE_KEY = "test-key-not-real-0000000000000000000000";

const withEnv = (vars) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
};

beforeEach(() => {
  svc.resetGeminiTransport();
  svc.resetHealthCache();
});

afterEach(() => {
  svc.resetGeminiTransport();
  svc.resetHealthCache();
});

describe("error classification", () => {
  const cases = [
    [{ status: 404, message: "models/gemini-1.5-flash is not found for API version v1beta" }, "MODEL_UNAVAILABLE", 503],
    [{ message: "This model models/gemini-2.5-flash is no longer available to new users." }, "MODEL_UNAVAILABLE", 503],
    [{ status: 400, message: "API key not valid. Please pass a valid API key." }, "INVALID_CREDENTIALS", 503],
    [{ status: 403, message: "PERMISSION_DENIED" }, "INVALID_CREDENTIALS", 503],
    [{ status: 429, message: "Too Many Requests" }, "QUOTA_EXCEEDED", 429],
    [{ message: "You exceeded your current quota, RESOURCE_EXHAUSTED" }, "QUOTA_EXCEEDED", 429],
    [{ status: 503, message: "The model is overloaded" }, "PROVIDER_UNAVAILABLE", 503],
    [{ message: "This model is currently experiencing high demand. UNAVAILABLE" }, "PROVIDER_UNAVAILABLE", 503],
    [Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }), "NETWORK_ERROR", 503],
    [Object.assign(new Error("socket"), { cause: { code: "ECONNRESET" } }), "NETWORK_ERROR", 503],
    [Object.assign(new Error("aborted"), { name: "AbortError" }), "TIMEOUT", 504],
    [new Error("something unexpected"), "UNKNOWN", 503],
  ];
  for (const [input, code, httpStatus] of cases) {
    test(`${code} (http ${httpStatus}) for: ${String(input.message).slice(0, 40)}`, () => {
      const err = svc.toAiError(input);
      assert.equal(err.code, code);
      assert.equal(err.httpStatus, httpStatus);
    });
  }

  test("AiError messages never contain the raw provider text or any key-like value", () => {
    const err = svc.toAiError({ status: 400, message: `API key not valid: ${FAKE_KEY}` });
    assert.equal(err.code, "INVALID_CREDENTIALS");
    assert.equal(err.userMessage.includes(FAKE_KEY), false);
    assert.equal(err.message.includes(FAKE_KEY), false);
  });
});

describe("configuration", () => {
  test("default model is used when GEMINI_MODEL is unset or blank", () => {
    const restore = withEnv({ GEMINI_MODEL: undefined });
    assert.equal(svc.getModelName(), svc.DEFAULT_MODEL);
    restore();
    const restore2 = withEnv({ GEMINI_MODEL: "   " });
    assert.equal(svc.getModelName(), svc.DEFAULT_MODEL);
    restore2();
  });

  test("a configured model name is used; malformed names fall back to the default", () => {
    const restore = withEnv({ GEMINI_MODEL: "gemini-3.8-flash" });
    assert.equal(svc.getModelName(), "gemini-3.8-flash");
    restore();
    const restore2 = withEnv({ GEMINI_MODEL: "models/x; DROP" });
    assert.equal(svc.getModelName(), svc.DEFAULT_MODEL);
    restore2();
  });

  test("not configured: no provider call is made", async () => {
    const restore = withEnv({ GEMINI_API_KEY: "" });
    let calls = 0;
    svc.setGeminiTransport(async () => {
      calls += 1;
      return "x";
    });
    await assert.rejects(svc.generateText({ user: "hi" }), (e) => e.code === "NOT_CONFIGURED");
    assert.equal(calls, 0);
    restore();
  });

  test("health reports not_configured without a network probe", async () => {
    const restore = withEnv({ GEMINI_API_KEY: "" });
    let calls = 0;
    svc.setGeminiTransport(async () => {
      calls += 1;
      return "OK";
    });
    const h = await svc.getHealth();
    assert.equal(h.status, "not_configured");
    assert.equal(h.configured, false);
    assert.equal(calls, 0);
    restore();
  });
});

describe("generateText", () => {
  test("the Google GenAI SDK sends credentials in a header and returns generated text", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: undefined });
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
      request = {
        url: String(url),
        headers: new Headers(options.headers),
        body: JSON.parse(options.body),
      };
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { role: "model", parts: [{ text: "  generated reply  " }] },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    try {
      svc.resetGeminiTransport();
      const result = await svc.generateText({
        system: "Keep it concise",
        user: "hello",
        json: true,
        maxOutputTokens: 64,
      });

      assert.equal(result, "generated reply");
      assert.match(request.url, /models\/gemini-3\.8-flash:generateContent/);
      assert.equal(request.url.includes(FAKE_KEY), false);
      assert.equal(request.headers.get("x-goog-api-key"), FAKE_KEY);
      assert.equal(request.body.generationConfig.responseMimeType, "application/json");
    } finally {
      globalThis.fetch = originalFetch;
      svc.resetGeminiTransport();
      restore();
    }
  });

  test("thinking headroom is added to the token budget and a MAX_TOKENS cut-off is a BAD_RESPONSE", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: undefined, GEMINI_FALLBACK_MODELS: "none" });
    const originalFetch = globalThis.fetch;
    let body;
    globalThis.fetch = async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(
        JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: '{"corrected": "trunc' }] }, finishReason: "MAX_TOKENS" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    try {
      svc.resetGeminiTransport();
      await assert.rejects(svc.generateText({ user: "hello", json: true, maxOutputTokens: 64 }), (e) => e.code === "BAD_RESPONSE");
      assert.ok(body.generationConfig.maxOutputTokens > 64, "visible budget must get thinking headroom");
    } finally {
      globalThis.fetch = originalFetch;
      svc.resetGeminiTransport();
      restore();
    }
  });

  test("returns trimmed text and passes system and user content separately", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    let seen;
    svc.setGeminiTransport(async (args) => {
      seen = args;
      return "  hello  ";
    });
    const out = await svc.generateText({ system: "be brief", user: "hi", json: true });
    assert.equal(out, "hello");
    assert.equal(seen.system, "be brief");
    assert.equal(seen.user, "hi");
    assert.equal(seen.json, true);
    restore();
  });

  test("an empty model reply is a BAD_RESPONSE, not an empty success", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    svc.setGeminiTransport(async () => "   ");
    await assert.rejects(svc.generateText({ user: "hi" }), (e) => e.code === "BAD_RESPONSE");
    restore();
  });

  test("provider errors surface as AiError codes", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    svc.setGeminiTransport(async () => {
      throw Object.assign(new Error("quota"), { status: 429 });
    });
    await assert.rejects(svc.generateText({ user: "hi" }), (e) => e.code === "QUOTA_EXCEEDED");
    restore();
  });
});

describe("health caching", () => {
  test("available results are cached: repeated calls make one provider request", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    let calls = 0;
    svc.setGeminiTransport(async () => {
      calls += 1;
      return "OK";
    });
    const a = await svc.getHealth();
    const b = await svc.getHealth();
    const c = await svc.getHealth();
    assert.equal(a.status, "available");
    assert.equal(b.cached, true);
    assert.equal(c.cached, true);
    assert.equal(calls, 1);
    restore();
  });

  test("concurrent health checks share a single probe", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    let calls = 0;
    svc.setGeminiTransport(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return "OK";
    });
    await Promise.all([svc.getHealth(), svc.getHealth(), svc.getHealth(), svc.getHealth()]);
    assert.equal(calls, 1);
    restore();
  });

  test("a forced refresh inside the minimum interval is refused (cannot be used to spend quota)", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    let calls = 0;
    svc.setGeminiTransport(async () => {
      calls += 1;
      return "OK";
    });
    await svc.getHealth();
    await svc.getHealth({ force: true });
    assert.equal(calls, 1);
    restore();
  });

  test("failures are reported with the specific status, not as available", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    svc.setGeminiTransport(async () => {
      throw Object.assign(new Error("API key not valid"), { status: 400 });
    });
    const h = await svc.getHealth();
    assert.equal(h.status, "invalid_credentials");
    assert.equal(h.configured, true, "configured is true because a key exists, but status is not available");
    assert.equal(JSON.stringify(h).includes(FAKE_KEY), false);
    restore();
  });

  test("each specific failure maps to its own health status", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    const map = [
      [{ status: 404, message: "not found" }, "model_unavailable"],
      [{ status: 429, message: "quota" }, "quota_exceeded"],
      [{ status: 503, message: "unavailable" }, "provider_unavailable"],
      [Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }), "network_error"],
    ];
    for (const [error, expected] of map) {
      svc.resetHealthCache();
      svc.setGeminiTransport(async () => {
        throw Object.assign(new Error(error.message), error);
      });
      const h = await svc.getHealth();
      assert.equal(h.status, expected);
    }
    restore();
  });
});

describe("MyMemory daily budget (translation fallback limits)", () => {
  test("requests beyond the daily character budget are refused, and the budget resets per day", () => {
    translation.resetMyMemoryBudget();
    const day1 = new Date("2026-11-25T10:00:00Z");
    const day2 = new Date("2026-11-26T10:00:00Z");
    const limit = Number(process.env.MYMEMORY_DAILY_CHAR_LIMIT) || 5000;
    assert.equal(translation.reserveMyMemoryChars(limit - 10, day1), true);
    assert.equal(translation.reserveMyMemoryChars(11, day1), false, "over the budget is refused");
    assert.equal(translation.reserveMyMemoryChars(10, day1), true, "exactly at the limit is allowed");
    assert.equal(translation.reserveMyMemoryChars(limit, day2), true, "budget resets on a new day");
    translation.resetMyMemoryBudget();
  });
});

describe("chat controller: context and error surfacing (mocked transport)", () => {
  const fakeRes = () => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    return res;
  };

  test("history is bounded to the last 8 turns, filtered, and length-capped", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "user" : "assistant", text: `t${i}` }));
    assert.equal(normalizeHistory(many).length, 8);
    assert.equal(normalizeHistory([{ role: "system", text: "x" }, { role: "user", text: "" }]).length, 0);
    assert.equal(normalizeHistory([{ role: "user", text: "a".repeat(900) }])[0].text.length, 500);
    assert.deepEqual(normalizeHistory("not-an-array"), []);
  });

  test("conversation history reaches the model as delimited data alongside the new message", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    let seen;
    svc.setGeminiTransport(async (args) => {
      seen = args;
      return "reply";
    });
    const res = fakeRes();
    await chatWithAI({ body: { message: "and now?", history: [{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }] } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(seen.user.includes("<conversation>"));
    assert.ok(seen.user.includes("User: hi"));
    assert.ok(seen.user.includes("<message>\nand now?"));
    svc.resetGeminiTransport();
    restore();
  });

  test("a retired model yields a 503 with a code and no raw provider text", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY });
    svc.setGeminiTransport(async () => {
      throw Object.assign(new Error("models/gemini-1.5-flash is not found for API version v1beta"), { status: 404 });
    });
    const res = fakeRes();
    await chatWithAI({ body: { message: "hi" } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, "MODEL_UNAVAILABLE");
    assert.equal(JSON.stringify(res.body).includes("gemini-1.5-flash"), false);
    svc.resetGeminiTransport();
    restore();
  });
});

describe("Gemini model fallback", () => {
  const overloaded = () => Object.assign(new Error("This model is currently experiencing high demand."), { status: 503 });

  test("an overloaded primary model falls back to the next model", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: "primary-model", GEMINI_FALLBACK_MODELS: "backup-a,backup-b" });
    const calls = [];
    svc.setGeminiTransport(async ({ model }) => {
      calls.push(model);
      if (model === "primary-model") throw overloaded();
      return "hello";
    });
    assert.equal(await svc.generateText({ user: "hi" }), "hello");
    assert.deepEqual(calls, ["primary-model", "backup-a"]);
    assert.equal(svc.getLastServedModel(), "backup-a");

    // The failed primary is cooling down, so the next request goes straight to the working model.
    calls.length = 0;
    await svc.generateText({ user: "hi" });
    assert.deepEqual(calls, ["backup-a"]);
    restore();
  });

  test("invalid credentials are not retried on other models", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: "primary-model", GEMINI_FALLBACK_MODELS: "backup-a" });
    const calls = [];
    svc.setGeminiTransport(async ({ model }) => {
      calls.push(model);
      throw Object.assign(new Error("API key not valid"), { status: 400 });
    });
    await assert.rejects(svc.generateText({ user: "hi" }), (e) => e.code === "INVALID_CREDENTIALS");
    assert.deepEqual(calls, ["primary-model"]);
    restore();
  });

  test("when every model fails the last error is reported", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: "primary-model", GEMINI_FALLBACK_MODELS: "backup-a" });
    svc.setGeminiTransport(async () => {
      throw overloaded();
    });
    await assert.rejects(svc.generateText({ user: "hi" }), (e) => e.code === "PROVIDER_UNAVAILABLE");
    restore();
  });

  test("GEMINI_FALLBACK_MODELS=none disables fallback; default chain starts with the default model", () => {
    const restore = withEnv({ GEMINI_MODEL: undefined, GEMINI_FALLBACK_MODELS: "none" });
    assert.deepEqual(svc.getModelChain(), [svc.DEFAULT_MODEL]);
    const restore2 = withEnv({ GEMINI_FALLBACK_MODELS: undefined });
    assert.deepEqual(svc.getModelChain(), [svc.DEFAULT_MODEL, ...svc.DEFAULT_FALLBACK_MODELS]);
    restore2();
    restore();
  });

  test("health reports degraded status and the serving model when the primary is busy", async () => {
    const restore = withEnv({ GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: "primary-model", GEMINI_FALLBACK_MODELS: "backup-a" });
    svc.setGeminiTransport(async ({ model }) => {
      if (model === "primary-model") throw overloaded();
      return "OK";
    });
    const health = await svc.getHealth({ force: true });
    assert.equal(health.status, "available");
    assert.equal(health.degraded, true);
    assert.equal(health.servedBy, "backup-a");
    restore();
  });
});
