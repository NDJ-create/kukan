import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client créé au premier usage (et non au chargement) pour que le build
// (pré-rendu des pages) ne dépende d'aucune clé. Les appels restent identiques :
// supabase.auth..., supabase.from(...), supabase.storage...
let client = null;

function getClient() {
  if (!client) client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    const value = getClient()[prop];
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
