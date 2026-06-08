import { auth } from "../auth.js";
import { supabaseClient } from "../libs/supabaseClient.js";

const TABLE_NAME = "inv_user";
const USER_SELECT = "id, name, email, role, emailVerified, createdAt, updatedAt";
const ALLOWED_ROLES = new Set(["guest", "worker", "manager", "admin"]);

function toSafeMessage(error, fallback) {
  if (typeof error?.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export async function index(_req, res) {
  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select(USER_SELECT)
    .order("createdAt", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ data: data ?? [] });
}

export async function create(req, res) {
  const email =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const role = typeof req.body?.role === "string" ? req.body.role.trim() : "";

  if (!email || !name || !password || !role) {
    res.status(400).json({
      error: "email, name, password, and role are required.",
    });
    return;
  }

  if (!ALLOWED_ROLES.has(role)) {
    res.status(400).json({
      error: "Invalid role. Allowed roles: guest, worker, manager, admin.",
    });
    return;
  }

  try {
    const created = await auth.api.signUpEmail({
      headers: new Headers(req.headers),
      body: {
        email,
        name,
        password,
        role,
      },
      asResponse: false,
    });

    const userId = created?.user?.id;
    if (typeof userId !== "string" || userId.length === 0) {
      res.status(201).json({
        data: {
          id: null,
          email,
          name,
          role,
          emailVerified: false,
        },
      });
      return;
    }

    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .select(USER_SELECT)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ data });
  } catch (error) {
    const message = toSafeMessage(error, "Failed to create user.");
    const alreadyExists = /already\s+exists|already\s+registered/i.test(message);
    res.status(alreadyExists ? 409 : 400).json({ error: message });
  }
}
