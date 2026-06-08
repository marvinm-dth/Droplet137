import "../load-env.js";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.INV_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.INV_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing INV_SUPABASE_URL or INV_SUPABASE_SERVICE_ROLE_KEY in environment.",
  );
}

export const supabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
    },
  },
);
