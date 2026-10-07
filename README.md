# Doutor Hérnia Dashboard

SaaS web para acompanhar as métricas operacionais e financeiras de uma clínica de fisioterapia:
painel da reunião semanal, resultados mensais, desempenho dos fisioterapeutas, marketing
(CAC, custo por lead / MQL / SQL), financeiro (margem, ponto de equilíbrio, projeção de cenários),
importação da planilha padronizada, autenticação e controle de acessos com Supabase.

## Stack

- **Front-end:** HTML + CSS + JavaScript (ES modules), sem build. Bibliotecas servidas localmente em `vendor/` (sem CDN):
  `supabase-js`, `Chart.js`, `SheetJS (xlsx)`.
- **Back-end:** Supabase (Postgres + Auth + RLS). Todo o cálculo de indicadores fica em views SQL.
- Pensado para migrar depois para Node: a camada `js/api.js` concentra todo o acesso a dados;
  as telas não falam com o Supabase diretamente.

## Estrutura

```
index.html                 login / criação de conta / recuperação de senha
app.html                   shell da aplicação (menu + roteamento por hash)
css/app.css
js/config.js               URL e chave publishable do Supabase, listas e metas padrão
js/supabase.js             cliente, sessão, perfil do usuário
js/api.js                  camada de dados (tabelas e views)
js/ui.js                   componentes: KPIs, tabelas, gráficos, formulários, toasts
js/importer.js             leitura da planilha padronizada e gravação
js/pages/*.js              uma tela por arquivo
supabase/migrations/       0001 schema + RLS, 0002 views + hardening
tools/build_planilha_modelo.py   gera Base_Dados_Clinica.xlsx (modelo da planilha)
tools/test_import.mjs      teste do importador fora do navegador
Base_Dados_Clinica.xlsx    modelo da planilha de coleta (com dados de exemplo)
```

## Telas

| Rota | Quem acessa | O que faz |
|---|---|---|
| `#/painel` | todos | Painel semanal com a pauta da reunião: abertura, crescimento, agenda, financeiro, experiência do paciente, operação, plano de ação 5W2H |
| `#/mensal` | todos | Consolidação mensal, evolução e tabela |
| `#/fisios` | todos | Comparativo por fisioterapeuta (avaliações, conversão, contratos, atendimentos, tempo médio) |
| `#/marketing` | todos | Funil, custo por lead / MQL / SQL, CAC, leads por canal |
| `#/financeiro` | todos (edição: admin/gestor) | Margem de contribuição, ponto de equilíbrio, simulador de cenários, classificação dos lançamentos |
| `#/semana` | admin, gestor | Lançamento manual de uma semana (base, fisios, leads por canal, contratos, reunião, ações) |
| `#/importar` | admin, gestor | Importação da planilha padronizada |
| `#/config` | admin, gestor | Nome da clínica, fisioterapeutas (slots 1 e 2 = Fisio 1 e 2 da planilha), metas |
| `#/usuarios` | admin | Usuários da clínica, papéis, ativação e convites por e-mail |

**Papéis:** `admin` (tudo), `gestor` (lança/importa/edita), `fisio` e `leitura` (somente consulta).

## Modelo de dados (Supabase)

- `clinicas`, `profiles` (1 por usuário; `papel`, `clinica_id`), `convites`
- `semanas` (calendário ISO, segunda a domingo, `AAAA-Sww`)
- `fisioterapeutas` (slot 1..9), `metas`
- `base_semanal` + `base_semanal_fisio` (números coletados por semana)
- `contratos` (avaliações e protocolos; `id_semana`/`mes` gerados pela data)
- `lancamentos` (receitas, gastos — com `tipo_custo` fixo/variável —, impostos, marketing)
- `leads_canal`, `reunioes`, `acoes` (5W2H), `importacoes`
- Views: `v_resumo_semanal`, `v_resumo_mensal`, `v_fisio_semanal`, `v_leads_canal_semanal`, `v_pendencias`

Isolamento por clínica e por papel via RLS (`current_clinica_id()`, `pode_editar()`).
Novo usuário: se houver convite para o e-mail, entra na clínica do convite com o papel definido;
senão, cria a própria clínica como admin.

Definições usadas nos indicadores:
- **MQL** = avaliação agendada · **SQL** = avaliação realizada · **CAC** = marketing ÷ novos pacientes
- **Margem de contribuição** = (receita − gastos variáveis − impostos) ÷ receita
- **Ponto de equilíbrio** = (gastos fixos + marketing) ÷ margem de contribuição
- Semanas são atribuídas ao mês da sua data de início; contratos e lançamentos ao mês da própria data.

## Como rodar

1. Crie o projeto no Supabase e aplique `supabase/migrations/0001_schema.sql` e `0002_views.sql`
   (SQL Editor ou `supabase db push`).
2. Em `js/config.js`, informe `SUPABASE_URL` e a chave *publishable* do projeto.
3. Em **Authentication → URL Configuration**, cadastre a URL onde o app será servido
   (ex.: GitHub Pages) como Site URL / Redirect URL.
4. Sirva os arquivos estáticos (GitHub Pages, Vercel, Netlify, ou `npx serve .` localmente).
5. Crie a primeira conta pela tela de login: ela vira admin da clínica informada.
6. Em **Metas e equipe**, confira os nomes dos fisioterapeutas e as metas; em **Importar planilha**,
   envie a `Base_Dados_Clinica.xlsx` preenchida.

## Importação da planilha

A planilha é lida pelo navegador (SheetJS) e gravada via supabase-js:
- `Config` → nomes dos fisioterapeutas e metas
- `Base_Semanal`, `Leads_Canal`, `Reuniao_Semanal` → atualizadas por semana (upsert)
- `Contratos`, `Financeiro`, `Plano_Acao` → os registros das semanas presentes no arquivo são
  substituídos (para reimportar sem duplicar)

## Caminho de migração para Node

1. Mover `js/api.js` para um backend (Express/Fastify) usando o mesmo schema e as mesmas views.
2. Trocar o cliente direto do Supabase por chamadas HTTP à API, mantendo as assinaturas de `api.js`.
3. Opcionalmente, mover `importer.js` para o servidor (upload do .xlsx) e empacotar o front com Vite.

## Cache no GitHub Pages

O Pages envia `Cache-Control: max-age=600`: após um deploy, o navegador pode usar módulos JS antigos por até 10 minutos.
Ao publicar, incremente `APP_VERSION` em `js/config.js` e o `?v=` em `app.html`/`index.html`; se necessário, recarregue com Ctrl+Shift+R.
