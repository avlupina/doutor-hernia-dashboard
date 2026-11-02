// Edge Function: sincroniza saldo, extrato e cobranças do Banco Inter Empresas para o Supabase.
// A API do Inter exige certificado de cliente (mTLS), por isso roda aqui e não no navegador.
// Chamada pelo app com o JWT do usuário (admin/gestor): { unidade_id, acao: "testar" | "sincronizar", de?, ate? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const INTER = "https://cdpj.partners.bancointer.com.br";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "", { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: u } = await user.auth.getUser();
    if (!u?.user) return json({ erro: "não autenticado" }, 401);
    const { data: perfil } = await user.from("profiles").select("clinica_id,papel,ativo").eq("id", u.user.id).single();
    if (!perfil?.ativo || !["admin", "gestor"].includes(perfil.papel)) return json({ erro: "sem permissão" }, 403);

    const body = await req.json().catch(() => ({}));
    const { unidade_id, acao = "sincronizar" } = body;
    if (!unidade_id) return json({ erro: "unidade_id obrigatório" }, 400);

    const { data: integ, error: e1 } = await admin.from("inter_integracoes").select("*").eq("unidade_id", unidade_id).eq("clinica_id", perfil.clinica_id).maybeSingle();
    if (e1) throw e1;
    if (!integ) return json({ erro: "Integração com o Banco Inter não cadastrada para esta unidade." }, 404);
    if (!integ.client_id || !integ.client_secret || !integ.certificado || !integ.chave_privada) return json({ erro: "Credenciais incompletas (Client ID, Client Secret, certificado e chave são obrigatórios)." }, 400);

    const api = await conectar(integ);
    const log: Record<string, unknown> = {};
    const hoje = new Date().toISOString().slice(0, 10);

    // saldo (também serve como teste de conexão)
    const saldo = await api.get("/banking/v2/saldo");
    log.saldo = saldo;
    const disponivel = num(saldo?.disponivel);
    await admin.from("inter_integracoes").update({ saldo: disponivel, saldo_em: hoje, ultimo_erro: null, updated_at: new Date().toISOString() }).eq("id", integ.id);
    await admin.from("inter_saldos").upsert({ unidade_id, clinica_id: integ.clinica_id, data: hoje, disponivel, detalhes: saldo }, { onConflict: "unidade_id,data" });
    if (acao === "testar") return json({ ok: true, saldo: disponivel, escopos: api.escopos });

    // período: do último item gravado (−7 dias) ou de sync_desde, até hoje; pode ser forçado no body
    let de: string = body.de;
    if (!de) {
      const { data: ult } = await admin.from("inter_extrato").select("data").eq("integracao_id", integ.id).order("data", { ascending: false }).limit(1).maybeSingle();
      de = ult?.data ? addDias(ult.data, -7) : integ.sync_desde;
    }
    const ate: string = body.ate || hoje;

    // ---- extrato (janelas de até 90 dias)
    let nExt = 0;
    for (const [a, b] of janelas(de, ate, 89)) {
      let pagina = 0, ultima = false;
      while (!ultima) {
        const r = await api.get(`/banking/v2/extrato/completo?dataInicio=${a}&dataFim=${b}&pagina=${pagina}&tamanhoPagina=200`);
        const trans: any[] = r?.transacoes ?? [];
        const rows = trans.map((t) => mapTransacao(t, integ)).filter((t) => t.id_transacao);
        for (let i = 0; i < rows.length; i += 400) {
          const { error } = await admin.from("inter_extrato").upsert(rows.slice(i, i + 400), { onConflict: "integracao_id,id_transacao", ignoreDuplicates: false });
          if (error) throw error;
        }
        nExt += rows.length;
        ultima = r?.ultimaPagina ?? (trans.length === 0);
        pagina++;
        if (pagina > 200) break;
      }
    }
    log.extrato = nExt;

    // ---- cobranças (se o escopo permitir)
    let nCob = 0;
    if (/boleto-cobranca\.read/.test(integ.escopos)) {
      const deCob = body.de || integ.sync_desde; // cobranças: sempre revisita o histórico (situação muda)
      for (const [a, b] of janelas(deCob, addDias(ate, 180), 89)) {
        let pagina = 0, ultima = false;
        while (!ultima) {
          const r = await api.get(`/cobranca/v3/cobrancas?dataInicial=${a}&dataFinal=${b}&filtrarDataPor=VENCIMENTO&paginaAtual=${pagina}&itensPorPagina=100`);
          const itens: any[] = r?.cobrancas ?? [];
          const rows = itens.map((c) => mapCobranca(c, integ)).filter((c) => c.codigo_solicitacao);
          if (rows.length) {
            const { error } = await admin.from("inter_cobrancas").upsert(rows, { onConflict: "integracao_id,codigo_solicitacao" });
            if (error) throw error;
          }
          nCob += rows.length;
          ultima = r?.ultimaPagina ?? (itens.length === 0);
          pagina++;
          if (pagina > 200) break;
        }
      }
    }
    log.cobrancas = nCob;

    // ---- classificação, lançamentos e conciliação (com o JWT do usuário: as funções checam o papel)
    const c1 = await user.rpc("inter_classificar", { p_unidade: unidade_id });
    const c2 = await user.rpc("inter_gerar_lancamentos", { p_unidade: unidade_id });
    const c3 = await user.rpc("inter_conciliar", { p_unidade: unidade_id, p_tolerancia: 5 });
    log.classificados = c1.data; log.lancamentos = c2.data; log.conciliados = c3.data;
    if (c1.error || c2.error || c3.error) log.avisos = [c1.error?.message, c2.error?.message, c3.error?.message].filter(Boolean);

    await admin.from("inter_integracoes").update({ ultima_sync: new Date().toISOString(), ultimo_erro: null }).eq("id", integ.id);
    return json({ ok: true, periodo: { de, ate }, saldo: disponivel, ...log });
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.error(msg);
    try {
      const b = await req.clone().json().catch(() => null);
      if (b?.unidade_id) await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).from("inter_integracoes").update({ ultimo_erro: msg.slice(0, 500) }).eq("unidade_id", b.unidade_id);
    } catch { /* ignore */ }
    return json({ erro: msg }, 500);
  }
});

// ------------------------------------------------------------------ cliente da API do Inter (mTLS + OAuth2)
async function conectar(integ: any) {
  const cert = pem(integ.certificado), key = pem(integ.chave_privada);
  let client: Deno.HttpClient;
  try { client = Deno.createHttpClient({ cert, key } as any); }
  catch { client = Deno.createHttpClient({ certChain: cert, privateKey: key } as any); } // runtimes mais antigos
  const escopos = integ.escopos || "extrato.read boleto-cobranca.read";
  const tk = await fetch(`${INTER}/oauth/v2/token`, {
    method: "POST", client,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: integ.client_id, client_secret: integ.client_secret, grant_type: "client_credentials", scope: escopos }),
  } as RequestInit & { client: Deno.HttpClient });
  const tj = await tk.json().catch(() => ({}));
  if (!tk.ok || !tj.access_token) throw new Error(`Falha ao obter token do Inter (${tk.status}): ${tj.error_description || tj.message || tj.title || JSON.stringify(tj)}`);
  const headers: Record<string, string> = { Authorization: `Bearer ${tj.access_token}`, Accept: "application/json" };
  if (integ.conta_corrente) headers["x-conta-corrente"] = String(integ.conta_corrente).replace(/\D/g, "");
  return {
    escopos: tj.scope || escopos,
    async get(path: string) {
      const r = await fetch(INTER + path, { headers, client } as RequestInit & { client: Deno.HttpClient });
      const t = await r.text();
      let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = { raw: t }; }
      if (!r.ok) throw new Error(`Inter ${path.split("?")[0]} → ${r.status}: ${j?.detail || j?.message || j?.title || t.slice(0, 300)}`);
      return j;
    },
  };
}

// aceita PEM colado com quebras perdidas (tudo numa linha) e normaliza
function pem(s: string) {
  s = (s || "").trim().replace(/\r/g, "");
  if (/\n/.test(s)) return s + "\n";
  const m = s.match(/^(-----BEGIN [A-Z ]+-----)(.*?)(-----END [A-Z ]+-----)$/s);
  if (!m) return s + "\n";
  const body = m[2].replace(/\s+/g, "").replace(/(.{64})/g, "$1\n");
  return `${m[1]}\n${body}\n${m[3]}\n`;
}

function num(v: unknown) { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; }
function addDias(iso: string, n: number) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function janelas(de: string, ate: string, dias: number): [string, string][] {
  const out: [string, string][] = []; let a = de;
  while (a <= ate) { const b = addDias(a, dias) < ate ? addDias(a, dias) : ate; out.push([a, b]); a = addDias(b, 1); }
  return out;
}

function mapTransacao(t: any, integ: any) {
  const det = t.detalhes || {};
  const nome = det.nomePagador || det.nomeRecebedor || det.nomeFavorecido || det.nomeBeneficiario || det.nomeOrigem || det.nomeDestino || det.nomeEmpresa || det.nomeTitular || det.razaoSocial || det.nome || null;
  const data = (t.dataTransacao || t.dataEntrada || t.dataInclusao || "").slice(0, 10);
  return {
    clinica_id: integ.clinica_id, unidade_id: integ.unidade_id, integracao_id: integ.id,
    id_transacao: String(t.idTransacao || t.id || `${data}|${t.tipoOperacao}|${t.valor}|${t.titulo}`),
    data, tipo_operacao: t.tipoOperacao === "C" ? "C" : "D",
    tipo_transacao: t.tipoTransacao || null, valor: Math.abs(num(t.valor) ?? 0),
    titulo: t.titulo || null, descricao: t.descricao || null, contraparte: nome, detalhes: t,
  };
}

function mapCobranca(c: any, integ: any) {
  const cb = c.cobranca || c, bol = c.boleto || {}, pix = c.pix || {};
  return {
    clinica_id: integ.clinica_id, unidade_id: integ.unidade_id, integracao_id: integ.id,
    codigo_solicitacao: cb.codigoSolicitacao || null, seu_numero: cb.seuNumero || null, nosso_numero: bol.nossoNumero || null,
    pagador: cb.pagador?.nome || null, pagador_doc: cb.pagador?.cpfCnpj || null,
    valor: num(cb.valorNominal), valor_recebido: num(cb.valorTotalRecebido),
    data_emissao: (cb.dataEmissao || "").slice(0, 10) || null, data_vencimento: (cb.dataVencimento || "").slice(0, 10) || null,
    data_situacao: (cb.dataSituacao || "").slice(0, 10) || null, situacao: cb.situacao || null, origem_recebimento: cb.origemRecebimento || (pix.txid ? "PIX" : null),
    detalhes: c, updated_at: new Date().toISOString(),
  };
}
