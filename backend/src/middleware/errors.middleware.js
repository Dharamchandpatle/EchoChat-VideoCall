// Final JSON 404 for unknown /api routes (keeps the API contract JSON-only).
export const notFound = (req, res, next) => {
  if (req.originalUrl.split("?")[0].startsWith("/api")) {
    return res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl.split("?")[0]}` });
  }
  return next();
};

// Centralized error handler. Never leaks stack traces to clients.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON body" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large" });
  }
  console.error("Unhandled error:", err?.message || err);
  return res.status(err?.status || 500).json({ message: "Internal Server Error" });
};
