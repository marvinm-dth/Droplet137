const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL_CK;
const SUPABASE_KEY = process.env.SUPABASE_KEY_CK;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;
