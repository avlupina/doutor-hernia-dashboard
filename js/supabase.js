// Cliente Supabase + sessão + perfil do usuário logado.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let _perfil = null;

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

/** Garante usuário logado; redireciona para o login se não houver sessão. */
export async function requireAuth() {
  const session = await getSession();
  if (!session) { window.location.href = "index.html"; return null; }
  return session;
}

/** Perfil (clínica, papel) do usuário atual, com cache simples. */
export async function getPerfil(force = false) {
  if (_perfil && !force) return _perfil;
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await sb.from("profiles").select("*, clinicas(nome)").eq("id", session.user.id).single();
  if (error) throw error;
  _perfil = { ...data, clinica_nome: data.clinicas?.nome, email: data.email || session.user.email };
  return _perfil;
}

export function podeEditar(perfil) { return ["admin", "gestor"].includes(perfil?.papel); }
export function isAdmin(perfil) { return perfil?.papel === "admin"; }

export async function sair() {
  await sb.auth.signOut();
  window.location.href = "index.html";
}

/** Lança erro legível a partir de uma resposta do supabase-js. */
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}
