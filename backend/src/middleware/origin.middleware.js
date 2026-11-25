// Defence in depth for cookie authentication. SameSite=Strict already stops most cross-site
// requests; this rejects state-changing requests whose Origin header is present and not allowed.
// Requests with no Origin header (server-to-server, curl) are not browser CSRF vectors and pass.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const originCheck = (allowedOrigins) => (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const sameHost = `${req.protocol}://${req.get("host")}`;
  if (origin === sameHost || allowedOrigins.has(origin)) return next();
  return res.status(403).json({ message: "Cross-origin request rejected" });
};
