const { createClient } = require('@supabase/supabase-js');

// Usa a service role key -> ignora RLS, só o backend acessa
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = { supabase };
