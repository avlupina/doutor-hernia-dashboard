// Configuração pública do Supabase (chave publishable pode ficar no front-end; o acesso é controlado por RLS).
export const SUPABASE_URL = "https://dbdshmevwjjpjhnovopr.supabase.co";
export const SUPABASE_KEY = "sb_publishable_ano7AZJBmc6zg1HJct7b5g_NUiUbRuV";

export const APP_NAME = "Doutor Hérnia Dashboard";
// Incrementar a cada publicação: evita que o navegador use módulos antigos em cache.
export const APP_VERSION = "2026.10.07-6";

// Primeiro mês com lançamentos (limite inferior dos seletores de período)
export const PERIODO_INICIO = "2025-07-01";

// Listas padrão (as mesmas da planilha)
export const LISTAS = {
  canais: ["Instagram", "Google", "WhatsApp direto", "Indicação", "Facebook", "Site", "Convênio/Parceria", "Passante/Fachada", "Outro"],
  formasPagamento: ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Boleto", "Transferência", "Convênio"],
  condicoes: ["À vista", "Parcelado"],
  statusPagamento: ["Pago", "Pendente", "Atrasado", "Cancelado"],
  categorias: ["Receita", "Gasto", "Imposto", "Marketing"],
  tiposCusto: ["Fixo", "Variável"],
  statusAcao: ["A fazer", "Em andamento", "Concluída", "Cancelada"],
  papeis: ["admin", "gestor", "fisio", "leitura"],
};

// Indicadores com meta (chave = nome exato usado na planilha Config)
export const METAS_PADRAO = [
  ["Leads recebidos", 40, 170],
  ["Novos pacientes", 8, 32],
  ["Avaliações realizadas", 12, 50],
  ["Contratos fechados (tratamentos)", 8, 32],
  ["Atendimentos realizados", 120, 500],
  ["Taxa de ocupação da agenda", 0.85, 0.85],
  ["Receita", 30000, 120000],
  ["Gastos", 18000, 72000],
  ["Investimento em marketing", 2500, 10000],
  ["Conversão avaliação → contrato", 0.6, 0.6],
  ["Taxa máx. de cancelamento de avaliações", 0.15, 0.15],
];
