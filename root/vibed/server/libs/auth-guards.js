import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../auth.js";

export async function requireSession(req, res, next) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.authSession = session;
  next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.authSession?.user?.role;

    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}

export const requireAdmin = [requireSession, requireRole("admin")];
