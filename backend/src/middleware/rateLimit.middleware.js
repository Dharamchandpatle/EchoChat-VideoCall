// Minimal fixed-window, in-memory rate limiter (per client IP).
// Good enough for a single Node instance; use a shared store (e.g. Redis) when scaling out.
export const rateLimit = ({ windowMs, max, name = "default", message, keyBy }) => {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const subject = (keyBy && keyBy(req)) || req.ip;
    const key = `${name}:${subject}`;
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message: message || "Too many requests. Please wait and try again.",
      });
    }

    return next();
  };
};
