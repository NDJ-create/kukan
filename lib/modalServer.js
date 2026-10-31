import { ModalClient } from "modal";

// Client Modal : uniquement côté serveur (routes app/api).
// Le jeton est lu dans MODAL_TOKEN_ID / MODAL_TOKEN_SECRET (jamais NEXT_PUBLIC_*).
const MODAL_APP_NAME = process.env.MODAL_APP_NAME || "kukan-inbetween";

let client = null;
const functions = new Map();

function getClient() {
  if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) {
    throw new Error("MODAL_NON_CONFIGURE");
  }
  if (!client) {
    client = new ModalClient({
      tokenId: process.env.MODAL_TOKEN_ID,
      tokenSecret: process.env.MODAL_TOKEN_SECRET,
      environment: process.env.MODAL_ENVIRONMENT || undefined,
    });
  }
  return client;
}

export async function getModalFunction(name) {
  if (!functions.has(name)) {
    const fn = await getClient().functions.fromName(MODAL_APP_NAME, name);
    functions.set(name, fn);
  }
  return functions.get(name);
}

// Appel borné dans le temps : on n'attend jamais sans fin.
export async function callModal(name, args, kwargs, timeoutMs) {
  const fn = await getModalFunction(name);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("DELAI_DEPASSE")), timeoutMs);
  });
  try {
    return await Promise.race([fn.remote(args, kwargs), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
