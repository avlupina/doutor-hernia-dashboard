from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment

FONT = "Arial"
C_HEAD = "1F4E5F"; C_SEC = "DCE8EC"; C_IN = "FFF2CC"; C_TITLE = "0F2F3A"
f_norm = Font(name=FONT, size=10)
f_bold = Font(name=FONT, size=10, bold=True)
f_head = Font(name=FONT, size=10, bold=True, color="FFFFFF")
f_title = Font(name=FONT, size=14, bold=True, color=C_TITLE)
f_sub = Font(name=FONT, size=10, italic=True, color="555555")
fill_head = PatternFill("solid", fgColor=C_HEAD)
fill_sec = PatternFill("solid", fgColor=C_SEC)
fill_in = PatternFill("solid", fgColor=C_IN)
thin = Side(style="thin", color="BFBFBF")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap = Alignment(wrap_text=True, vertical="top")
center = Alignment(horizontal="center", vertical="center", wrap_text=True)

BRL = 'R$ #,##0.00'; PCT = '0.0%'; DT = 'dd/mm/yyyy'; INT = '0'; DEC = '0.0'

wb = Workbook()
DICT = []  # dicionário de dados

def header(ws, row, cols, widths=None):
    for i, name in enumerate(cols, 1):
        c = ws.cell(row=row, column=i, value=name)
        c.font = f_head; c.fill = fill_head; c.alignment = center; c.border = border
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[L(i)].width = w
    ws.row_dimensions[row].height = 32

def style_range(ws, r1, r2, c1, c2, fill=None, fmt=None, font=f_norm, align=None):
    for r in range(r1, r2 + 1):
        for c in range(c1, c2 + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = font; cell.border = border
            if fill: cell.fill = fill
            if fmt: cell.number_format = fmt
            if align: cell.alignment = align

def title(ws, text, sub=None):
    ws["A1"] = text; ws["A1"].font = f_title
    if sub:
        ws["A2"] = sub; ws["A2"].font = f_sub

# ---------------------------------------------------------------- Calendário
weeks = []
d = date(2026, 1, 5)
while d <= date(2027, 12, 27):
    iy, iw, _ = d.isocalendar()
    weeks.append((f"{iy}-S{iw:02d}", d, d + timedelta(days=6), f"{d.year}-{d.month:02d}"))
    d += timedelta(days=7)
NW = len(weeks)
months = sorted({w[3] for w in weeks})
WROW1, WROWN = 2, NW + 1          # linhas das semanas em Base_Semanal / Resumo_Semanal

# ---------------------------------------------------------------- Config
cfg = wb.active; cfg.title = "Config"
title(cfg, "Configurações, metas e listas", "Células amarelas: preencher. As listas alimentam os menus (validação) das abas de coleta.")
cfg["A4"] = "Equipe"; cfg["A4"].font = f_bold
cfg["A5"] = "Fisio 1"; cfg["B5"] = "Ariosto"
cfg["A6"] = "Fisio 2"; cfg["B6"] = "Tássia"
style_range(cfg, 5, 6, 1, 1); style_range(cfg, 5, 6, 2, 2, fill=fill_in)
cfg["A8"] = "Metas"; cfg["A8"].font = f_bold
header(cfg, 9, ["Indicador", "Meta semanal", "Meta mensal"])
metas = [
    ("Leads recebidos", 40, 170, INT), ("Novos pacientes", 8, 32, INT),
    ("Avaliações realizadas", 12, 50, INT), ("Contratos fechados (tratamentos)", 8, 32, INT),
    ("Atendimentos realizados", 120, 500, INT), ("Taxa de ocupação da agenda", 0.85, 0.85, PCT),
    ("Receita", 30000, 120000, BRL), ("Gastos", 18000, 72000, BRL),
    ("Investimento em marketing", 2500, 10000, BRL), ("Conversão avaliação → contrato", 0.6, 0.6, PCT),
    ("Taxa máx. de cancelamento de avaliações", 0.15, 0.15, PCT),
]
META = {}
for i, (n, s, m, fmt) in enumerate(metas):
    r = 10 + i
    cfg.cell(row=r, column=1, value=n); cfg.cell(row=r, column=2, value=s); cfg.cell(row=r, column=3, value=m)
    style_range(cfg, r, r, 1, 1); style_range(cfg, r, r, 2, 3, fill=fill_in, fmt=fmt)
    META[n] = r
cfg.cell(row=21, column=1, value="Metas são valores de referência informados pelo usuário; ajuste conforme o planejamento da clínica.").font = f_sub

lists = {
    "Tipo de contrato": ["Avaliação", "Protocolo"],
    "Condição de pagamento": ["À vista", "Parcelado"],
    "Forma de pagamento": ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Boleto", "Transferência", "Convênio"],
    "Status de pagamento": ["Pago", "Pendente", "Atrasado", "Cancelado"],
    "Canal de ingresso": ["Instagram", "Google", "WhatsApp direto", "Indicação", "Facebook", "Site", "Convênio/Parceria", "Passante/Fachada", "Outro"],
    "Categoria financeira": ["Receita", "Gasto", "Imposto", "Marketing"],
    "Tipo de custo": ["Fixo", "Variável"],
    "Status da ação": ["A fazer", "Em andamento", "Concluída", "Cancelada"],
    "Resultado geral": ["Melhor", "Igual", "Pior"],
    "Sim/Não": ["Sim", "Não"],
    "Fisioterapeuta": ["=$B$5", "=$B$6"],
}
LIST_REF = {}
col = 5
for name, items in lists.items():
    c = cfg.cell(row=9, column=col, value=name); c.font = f_head; c.fill = fill_head; c.alignment = center; c.border = border
    for j, it in enumerate(items):
        cell = cfg.cell(row=10 + j, column=col, value=it)
        cell.border = border; cell.font = f_norm
        if not str(it).startswith("="): cell.fill = fill_in
    LIST_REF[name] = f"Config!${L(col)}$10:${L(col)}${9 + max(len(items), 12)}"
    cfg.column_dimensions[L(col)].width = 22
    col += 1
cfg.row_dimensions[9].height = 32
cfg.column_dimensions["A"].width = 40; cfg.column_dimensions["B"].width = 16; cfg.column_dimensions["C"].width = 16
FISIO1 = "Config!$B$5"; FISIO2 = "Config!$B$6"

# ---------------------------------------------------------------- Calendário
cal = wb.create_sheet("Calendario")
title(cal, "Calendário de semanas", "Semanas ISO (segunda a domingo). O mês da semana é o mês da data de início.")
header(cal, 3, ["id_semana", "Início", "Fim", "Mês"], [12, 12, 12, 10])
for i, (wid, s, e, m) in enumerate(weeks):
    r = 4 + i
    cal.cell(row=r, column=1, value=wid); cal.cell(row=r, column=2, value=s); cal.cell(row=r, column=3, value=e); cal.cell(row=r, column=4, value=m)
style_range(cal, 4, 3 + NW, 1, 4); style_range(cal, 4, 3 + NW, 2, 3, fmt=DT)
cal.freeze_panes = "A4"
CAL_A = "Calendario!$A$4:$A$%d" % (3 + NW); CAL_B = "Calendario!$B$4:$B$%d" % (3 + NW)
CAL_C = "Calendario!$C$4:$C$%d" % (3 + NW); CAL_D = "Calendario!$D$4:$D$%d" % (3 + NW)

def dv(ws, rng, src):
    v = DataValidation(type="list", formula1=src, allow_blank=True); v.error = "Escolha um valor da lista"; ws.add_data_validation(v); v.add(rng)

# ---------------------------------------------------------------- Base_Semanal
bs = wb.create_sheet("Base_Semanal")
bs_cols = [
    ("id_semana", 11, None, "Identificador da semana (AAAA-Sww), pré-preenchido a partir do Calendário"),
    ("Início", 11, DT, "Data de início da semana (automático)"),
    ("Fim", 11, DT, "Data de fim da semana (automático)"),
    ("Mês", 9, None, "Mês de referência AAAA-MM (automático)"),
    ("Leads recebidos", 11, INT, "Total de leads recebidos na semana"),
    ("Aval. agendadas", 11, INT, "Avaliações agendadas na semana"),
    ("Aval. canceladas", 11, INT, "Avaliações canceladas na semana"),
    ("Aval. realizadas Fisio 1", 12, INT, "Avaliações realizadas pelo Fisio 1"),
    ("Aval. realizadas Fisio 2", 12, INT, "Avaliações realizadas pelo Fisio 2"),
    ("Contratos fechados Fisio 1", 12, INT, "Contratos (tratamentos) fechados pelo Fisio 1"),
    ("Contratos fechados Fisio 2", 12, INT, "Contratos (tratamentos) fechados pelo Fisio 2"),
    ("Atendimentos Fisio 1", 12, INT, "Atendimentos realizados pelo Fisio 1"),
    ("Atendimentos Fisio 2", 12, INT, "Atendimentos realizados pelo Fisio 2"),
    ("Cancelamentos de atendimentos", 13, INT, "Atendimentos cancelados/faltas na semana"),
    ("Novos pacientes", 11, INT, "Pacientes que iniciaram na clínica na semana"),
    ("Horários disponíveis manhã", 12, INT, "Capacidade de agenda no turno da manhã (nº de horários)"),
    ("Horários ocupados manhã", 12, INT, "Horários ocupados/agendados no turno da manhã"),
    ("Horários disponíveis tarde", 12, INT, "Capacidade de agenda no turno da tarde"),
    ("Horários ocupados tarde", 12, INT, "Horários ocupados/agendados no turno da tarde"),
    ("Tempo médio atend. Fisio 1 (min)", 13, DEC, "Tempo médio por atendimento do Fisio 1, em minutos"),
    ("Desvio padrão Fisio 1 (min)", 12, DEC, "Desvio padrão do tempo de atendimento do Fisio 1"),
    ("Tempo médio atend. Fisio 2 (min)", 13, DEC, "Tempo médio por atendimento do Fisio 2, em minutos"),
    ("Desvio padrão Fisio 2 (min)", 12, DEC, "Desvio padrão do tempo de atendimento do Fisio 2"),
    ("Observações", 30, None, "Texto livre"),
]
title(bs, "Base de dados semanal (coleta)", "Preencha as colunas amarelas; uma linha por semana. As três primeiras colunas de datas são automáticas.")
HR = 3  # header row for data sheets
header(bs, HR, [c[0] for c in bs_cols], [c[1] for c in bs_cols])
for i, (wid, s, e, m) in enumerate(weeks):
    r = 4 + i
    bs.cell(row=r, column=1, value=wid)
    bs.cell(row=r, column=2, value=f"=IFERROR(INDEX({CAL_B},MATCH($A{r},{CAL_A},0)),\"\")")
    bs.cell(row=r, column=3, value=f"=IFERROR(INDEX({CAL_C},MATCH($A{r},{CAL_A},0)),\"\")")
    bs.cell(row=r, column=4, value=f"=IFERROR(INDEX({CAL_D},MATCH($A{r},{CAL_A},0)),\"\")")
BS1, BSN = 4, 3 + NW
style_range(bs, BS1, BSN, 1, 4); style_range(bs, BS1, BSN, 2, 3, fmt=DT)
for ci, c in enumerate(bs_cols[4:], 5):
    style_range(bs, BS1, BSN, ci, ci, fill=fill_in, fmt=c[2])
bs.freeze_panes = "E4"
for c in bs_cols: DICT.append(("Base_Semanal", c[0], "preenchido" if c[1] and c[3].find("automático") < 0 else "automático", c[3]))

# exemplos: S39, S40 (completas) e S41 (apenas agenda da próxima semana)
ex = {
    "2026-S39": [38, 14, 2, 6, 5, 4, 3, 58, 52, 7, 6, 60, 54, 60, 50, 42.5, 6.1, 39.8, 5.4, "Exemplo — substitua pelos dados reais"],
    "2026-S40": [45, 16, 1, 8, 6, 6, 4, 63, 57, 5, 9, 60, 57, 60, 55, 41.2, 5.8, 40.5, 4.9, "Exemplo — substitua pelos dados reais"],
    "2026-S41": [None, None, None, None, None, None, None, None, None, None, None, 60, 44, 60, 38, None, None, None, None, "Exemplo — agenda já ocupada para a próxima semana"],
}
widx = {w[0]: 4 + i for i, w in enumerate(weeks)}
for wid, vals in ex.items():
    for j, v in enumerate(vals):
        if v is not None: bs.cell(row=widx[wid], column=5 + j, value=v)
BSR = lambda col: f"Base_Semanal!${col}${BS1}:${col}${BSN}"

# ---------------------------------------------------------------- Contratos
ct = wb.create_sheet("Contratos")
ct_cols = [
    ("Data", 11, DT, "Data do fechamento"), ("id_semana", 11, None, "Semana do fechamento (automático)"), ("Mês", 9, None, "Mês AAAA-MM (automático)"),
    ("Paciente", 22, None, "Nome do paciente"), ("Tipo", 12, None, "Avaliação ou Protocolo"), ("Fisioterapeuta", 14, None, "Profissional responsável"),
    ("Protocolo / descrição", 24, None, "Nome do protocolo ou descrição"), ("Nº sessões", 10, INT, "Quantidade de sessões contratadas"),
    ("Valor (R$)", 13, BRL, "Valor total contratado"), ("Condição de pagamento", 14, None, "À vista ou Parcelado"),
    ("Forma de pagamento", 16, None, "Pix, cartão, boleto..."), ("Parcelas", 9, INT, "Número de parcelas (1 = à vista)"),
    ("Status pagamento", 13, None, "Pago, Pendente, Atrasado, Cancelado"), ("Canal de ingresso", 16, None, "Meio pelo qual o paciente chegou"),
    ("Observações", 30, None, "Texto livre"),
]
title(ct, "Avaliações e protocolos contratados", "Uma linha por contrato fechado. Semana e mês são calculados pela data.")
header(ct, HR, [c[0] for c in ct_cols], [c[1] for c in ct_cols])
NROWS = 500
for r in range(4, 4 + NROWS):
    ct.cell(row=r, column=2, value=f"=IF(A{r}=\"\",\"\",IFERROR(INDEX({CAL_A},MATCH(A{r},{CAL_B},1)),\"\"))")
    ct.cell(row=r, column=3, value=f"=IF(A{r}=\"\",\"\",YEAR(A{r})&\"-\"&TEXT(MONTH(A{r}),\"00\"))")
style_range(ct, 4, 3 + NROWS, 1, len(ct_cols))
for ci, c in enumerate(ct_cols, 1):
    style_range(ct, 4, 3 + NROWS, ci, ci, fill=None if ci in (2, 3) else fill_in, fmt=c[2])
dv(ct, f"E4:E{3+NROWS}", LIST_REF["Tipo de contrato"]); dv(ct, f"F4:F{3+NROWS}", LIST_REF["Fisioterapeuta"])
dv(ct, f"J4:J{3+NROWS}", LIST_REF["Condição de pagamento"]); dv(ct, f"K4:K{3+NROWS}", LIST_REF["Forma de pagamento"])
dv(ct, f"M4:M{3+NROWS}", LIST_REF["Status de pagamento"]); dv(ct, f"N4:N{3+NROWS}", LIST_REF["Canal de ingresso"])
ct.freeze_panes = "D4"
ct_ex = [
    (date(2026, 9, 22), "Maria S. (exemplo)", "Avaliação", "Ariosto", "Avaliação inicial coluna", 1, 150, "À vista", "Pix", 1, "Pago", "Instagram"),
    (date(2026, 9, 23), "João P. (exemplo)", "Protocolo", "Tássia", "Protocolo hérnia lombar — 20 sessões", 20, 3800, "Parcelado", "Cartão de crédito", 6, "Pago", "Google"),
    (date(2026, 9, 25), "Carla M. (exemplo)", "Protocolo", "Ariosto", "Protocolo cervical — 12 sessões", 12, 2400, "À vista", "Pix", 1, "Pago", "Indicação"),
    (date(2026, 9, 29), "Pedro L. (exemplo)", "Avaliação", "Tássia", "Avaliação inicial", 1, 150, "À vista", "Dinheiro", 1, "Pago", "WhatsApp direto"),
    (date(2026, 9, 30), "Ana R. (exemplo)", "Protocolo", "Ariosto", "Protocolo hérnia lombar — 20 sessões", 20, 3800, "Parcelado", "Boleto", 4, "Pendente", "Instagram"),
    (date(2026, 10, 1), "Lucas F. (exemplo)", "Protocolo", "Tássia", "Protocolo joelho — 16 sessões", 16, 3000, "Parcelado", "Cartão de crédito", 3, "Pago", "Indicação"),
    (date(2026, 10, 2), "Beatriz C. (exemplo)", "Avaliação", "Ariosto", "Avaliação inicial", 1, 150, "À vista", "Pix", 1, "Pago", "Google"),
]
for i, row in enumerate(ct_ex):
    r = 4 + i
    ct.cell(row=r, column=1, value=row[0])
    for j, v in enumerate(row[1:]): ct.cell(row=r, column=4 + j, value=v)
    ct.cell(row=r, column=15, value="Exemplo — substitua pelos dados reais")
for c in ct_cols: DICT.append(("Contratos", c[0], "automático" if "automático" in c[3] else "preenchido", c[3]))
CT = lambda col: f"Contratos!${col}$4:${col}${3+NROWS}"

# ---------------------------------------------------------------- Financeiro
fn = wb.create_sheet("Financeiro")
fn_cols = [
    ("Data", 11, DT, "Data do lançamento (competência)"), ("id_semana", 11, None, "Semana (automático)"), ("Mês", 9, None, "Mês AAAA-MM (automático)"),
    ("Categoria", 13, None, "Receita, Gasto, Imposto ou Marketing"), ("Tipo de custo", 12, None, "Fixo ou Variável (somente gastos) — usado no ponto de equilíbrio"), ("Descrição", 30, None, "Descrição do lançamento"),
    ("Valor (R$)", 13, BRL, "Valor do lançamento (sempre positivo)"), ("Status", 12, None, "Pago, Pendente, Atrasado, Cancelado"),
    ("Vencimento", 11, DT, "Data de vencimento (para pendências/inadimplência)"), ("Paciente / fornecedor", 22, None, "Contraparte"),
    ("Observações", 30, None, "Texto livre"),
]
title(fn, "Financeiro (lançamentos)", "Uma linha por receita, gasto, imposto ou investimento em marketing. Receitas com status Pendente = pendências; Atrasado = inadimplência.")
header(fn, HR, [c[0] for c in fn_cols], [c[1] for c in fn_cols])
for r in range(4, 4 + NROWS):
    fn.cell(row=r, column=2, value=f"=IF(A{r}=\"\",\"\",IFERROR(INDEX({CAL_A},MATCH(A{r},{CAL_B},1)),\"\"))")
    fn.cell(row=r, column=3, value=f"=IF(A{r}=\"\",\"\",YEAR(A{r})&\"-\"&TEXT(MONTH(A{r}),\"00\"))")
for ci, c in enumerate(fn_cols, 1):
    style_range(fn, 4, 3 + NROWS, ci, ci, fill=None if ci in (2, 3) else fill_in, fmt=c[2])
dv(fn, f"D4:D{3+NROWS}", LIST_REF["Categoria financeira"]); dv(fn, f"E4:E{3+NROWS}", LIST_REF["Tipo de custo"]); dv(fn, f"H4:H{3+NROWS}", LIST_REF["Status de pagamento"])
fn.freeze_panes = "D4"
fn_ex = [
    (date(2026, 9, 22), "Receita", None, "Avaliação — Maria S.", 150, "Pago", date(2026, 9, 22), "Maria S."),
    (date(2026, 9, 23), "Receita", None, "Protocolo — João P. (1/6)", 633.33, "Pago", date(2026, 9, 23), "João P."),
    (date(2026, 9, 25), "Receita", None, "Protocolo — Carla M.", 2400, "Pago", date(2026, 9, 25), "Carla M."),
    (date(2026, 9, 25), "Gasto", "Fixo", "Folha de pagamento — recepção", 2800, "Pago", date(2026, 9, 25), "Equipe"),
    (date(2026, 9, 26), "Marketing", None, "Impulsionamento Instagram", 600, "Pago", date(2026, 9, 26), "Meta Ads"),
    (date(2026, 9, 29), "Receita", None, "Avaliação — Pedro L.", 150, "Pago", date(2026, 9, 29), "Pedro L."),
    (date(2026, 9, 30), "Receita", None, "Protocolo — Ana R. (1/4)", 950, "Pendente", date(2026, 10, 10), "Ana R."),
    (date(2026, 10, 1), "Receita", None, "Protocolo — Lucas F. (1/3)", 1000, "Pago", date(2026, 10, 1), "Lucas F."),
    (date(2026, 10, 1), "Gasto", "Fixo", "Aluguel", 4500, "Pago", date(2026, 10, 1), "Imobiliária"),
    (date(2026, 10, 1), "Gasto", "Variável", "Material de consumo (bandagens, eletrodos)", 380, "Pago", date(2026, 10, 1), "Fornecedor"),
    (date(2026, 10, 2), "Imposto", None, "Simples Nacional — DAS", 1850, "Pago", date(2026, 10, 20), "Receita Federal"),
    (date(2026, 10, 2), "Marketing", None, "Google Ads", 700, "Pago", date(2026, 10, 2), "Google"),
    (date(2026, 10, 2), "Receita", None, "Protocolo — Roberto A. (2/5)", 760, "Atrasado", date(2026, 9, 15), "Roberto A."),
]
for i, row in enumerate(fn_ex):
    r = 4 + i
    fn.cell(row=r, column=1, value=row[0])
    for j, v in enumerate(row[1:]): fn.cell(row=r, column=4 + j, value=v)
    fn.cell(row=r, column=11, value="Exemplo — substitua pelos dados reais")
for c in fn_cols: DICT.append(("Financeiro", c[0], "automático" if "automático" in c[3] else "preenchido", c[3]))
FN = lambda col: f"Financeiro!${col}$4:${col}${3+NROWS}"

# ---------------------------------------------------------------- Leads_Canal
lc = wb.create_sheet("Leads_Canal")
title(lc, "Leads por canal de ingresso", "Uma linha por semana e canal. A soma deve bater com 'Leads recebidos' da Base_Semanal (há checagem no Resumo_Semanal).")
header(lc, HR, ["id_semana", "Canal", "Quantidade", "Observações"], [12, 20, 12, 30])
style_range(lc, 4, 3 + NROWS, 1, 4, fill=fill_in); style_range(lc, 4, 3 + NROWS, 3, 3, fill=fill_in, fmt=INT)
dv(lc, f"A4:A{3+NROWS}", CAL_A); dv(lc, f"B4:B{3+NROWS}", LIST_REF["Canal de ingresso"])
lc.freeze_panes = "A4"
lc_ex = [("2026-S39", "Instagram", 16), ("2026-S39", "Google", 10), ("2026-S39", "Indicação", 7), ("2026-S39", "WhatsApp direto", 5),
         ("2026-S40", "Instagram", 20), ("2026-S40", "Google", 12), ("2026-S40", "Indicação", 8), ("2026-S40", "WhatsApp direto", 5)]
for i, row in enumerate(lc_ex):
    for j, v in enumerate(row): lc.cell(row=4 + i, column=1 + j, value=v)
    lc.cell(row=4 + i, column=4, value="Exemplo")
for n, dsc in [("id_semana", "Semana (escolher da lista)"), ("Canal", "Canal de ingresso (lista em Config)"), ("Quantidade", "Leads recebidos pelo canal na semana")]:
    DICT.append(("Leads_Canal", n, "preenchido", dsc))
LC = lambda col: f"Leads_Canal!${col}$4:${col}${3+NROWS}"

# ---------------------------------------------------------------- Reuniao_Semanal
rs = wb.create_sheet("Reuniao_Semanal")
rs_cols = [
    ("id_semana", 11, "Semana da reunião"), ("Resultado geral (registrado)", 14, "Melhor, Igual ou Pior que a semana anterior — percepção da equipe"),
    ("Pontos positivos", 30, "Abertura"), ("Pontos a melhorar", 30, "Abertura"),
    ("Pacientes críticos / risco de desistência", 30, "Experiência do paciente"), ("Pontos pertinentes", 30, "Experiência do paciente"),
    ("Problemas no atendimento", 30, "Experiência do paciente"), ("Algo prejudicando a experiência?", 14, "Sim/Não"),
    ("Descrição do que prejudica", 30, "Detalhe, se Sim"), ("Demandas da recepção e equipe", 30, "Operação da semana / próxima semana"),
    ("Pontos relevantes (próxima semana)", 30, "Operação da próxima semana"), ("Outros pontos", 30, "O que mais ocorrer"),
    ("Metas da semana", 30, "Plano de ação"), ("Soluções para os problemas identificados", 30, "Plano de ação"),
]
title(rs, "Registro qualitativo da reunião semanal", "Uma linha por semana. Os textos aparecem automaticamente no Painel_Semanal.")
header(rs, HR, [c[0] for c in rs_cols], [c[1] for c in rs_cols])
style_range(rs, 4, 3 + 200, 1, len(rs_cols), fill=fill_in, align=wrap)
dv(rs, "A4:A203", CAL_A); dv(rs, "B4:B203", LIST_REF["Resultado geral"]); dv(rs, "H4:H203", LIST_REF["Sim/Não"])
rs.freeze_panes = "B4"
rs_ex = ["2026-S40", "Melhor", "Receita acima da meta; 4 protocolos fechados por indicação", "Taxa de ocupação da tarde abaixo de 90%; 5 cancelamentos de atendimento",
         "Roberto A. — 2 faltas seguidas e parcela em atraso; Ana R. — reclamou de espera", "Pacientes elogiaram o novo protocolo de alongamento",
         "Espera de 15 min na recepção em dois dias (acúmulo às 8h)", "Sim", "Atraso na abertura da recepção às 7h50",
         "Recepção pede roteiro de confirmação de consulta por WhatsApp", "Agenda da manhã já com 73% ocupada; reforçar captação para a tarde",
         "Manutenção do ar-condicionado da sala 2 agendada para quinta", "Receita R$ 32.000; 10 avaliações; ocupação total ≥ 85%",
         "Confirmação de consulta 24h antes por WhatsApp; escala da recepção a partir de 7h40"]
for j, v in enumerate(rs_ex): rs.cell(row=4, column=1 + j, value=v)
rs.cell(row=5, column=1, value="2026-S39"); rs.cell(row=5, column=2, value="Igual"); rs.cell(row=5, column=3, value="Exemplo — substitua pelos dados reais")
for c in rs_cols: DICT.append(("Reuniao_Semanal", c[0], "preenchido", c[2]))
RS = lambda col: f"Reuniao_Semanal!${col}$4:${col}$203"

# ---------------------------------------------------------------- Plano_Acao
pa = wb.create_sheet("Plano_Acao")
pa_cols = [("id_semana", 11, "Semana em que a ação foi definida"), ("Ordem", 7, "Sequência da ação dentro da semana (automático)"),
           ("Problema / meta", 26, "Origem da ação"), ("O quê (What)", 26, "Ação a executar"), ("Por quê (Why)", 22, "Justificativa"),
           ("Onde (Where)", 14, "Local/área"), ("Quando (When)", 11, "Prazo"), ("Quem (Who)", 14, "Responsável"),
           ("Como (How)", 26, "Método"), ("Quanto (How much)", 13, "Custo estimado (R$)"), ("Status", 12, "A fazer, Em andamento, Concluída, Cancelada"),
           ("chave", 12, "Chave id_semana-ordem usada pelo painel (automático)")]
title(pa, "Plano de ação 5W2H", "Uma linha por ação. As 8 primeiras ações de cada semana aparecem no Painel_Semanal.")
header(pa, HR, [c[0] for c in pa_cols], [c[1] for c in pa_cols])
for r in range(4, 4 + NROWS):
    pa.cell(row=r, column=2, value=f"=IF(A{r}=\"\",\"\",COUNTIF($A$4:A{r},A{r}))")
    pa.cell(row=r, column=12, value=f"=IF(A{r}=\"\",\"\",A{r}&\"-\"&B{r})")
for ci, c in enumerate(pa_cols, 1):
    style_range(pa, 4, 3 + NROWS, ci, ci, fill=None if ci in (2, 12) else fill_in, align=wrap,
                fmt=DT if ci == 7 else (BRL if ci == 10 else None))
dv(pa, f"A4:A{3+NROWS}", CAL_A); dv(pa, f"K4:K{3+NROWS}", LIST_REF["Status da ação"])
pa.freeze_panes = "C4"
pa_ex = [
    ("2026-S40", "Espera na recepção às 8h", "Antecipar abertura da recepção", "Reduzir espera e reclamações", "Recepção", date(2026, 10, 6), "Recepção", "Escala iniciando às 7h40; check-in antecipado", 0, "Em andamento"),
    ("2026-S40", "Cancelamentos de atendimento", "Confirmar consultas 24h antes por WhatsApp", "Reduzir faltas e liberar horários", "Recepção", date(2026, 10, 9), "Recepção", "Modelo de mensagem + lista diária de confirmação", 0, "A fazer"),
    ("2026-S40", "Ocupação da tarde < 90%", "Campanha de captação para horários da tarde", "Elevar taxa de ocupação", "Marketing", date(2026, 10, 16), "Ariosto", "Anúncio segmentado + oferta de avaliação à tarde", 400, "A fazer"),
]
for i, row in enumerate(pa_ex):
    pa.cell(row=4 + i, column=1, value=row[0])
    for j, v in enumerate(row[1:]): pa.cell(row=4 + i, column=3 + j, value=v)
for c in pa_cols: DICT.append(("Plano_Acao", c[0], "automático" if "automático" in c[2] else "preenchido", c[2]))
PA = lambda col: f"Plano_Acao!${col}$4:${col}${3+NROWS}"

# ---------------------------------------------------------------- Resumo_Semanal (fórmulas)
rw = wb.create_sheet("Resumo_Semanal")
title(rw, "Resumo semanal (calculado)", "Não edite: tudo é calculado a partir das abas de coleta. Base do Painel_Semanal.")
RW = {}
rw_cols = []  # (name, width, fmt, formula_template with {r})
def add(name, w, fmt, f): rw_cols.append((name, w, fmt, f))
add("id_semana", 11, None, "=Base_Semanal!A{r}"); add("Início", 11, DT, "=Base_Semanal!B{r}"); add("Fim", 11, DT, "=Base_Semanal!C{r}"); add("Mês", 9, None, "=Base_Semanal!D{r}")
add("Leads recebidos", 10, INT, "=Base_Semanal!E{r}"); add("Aval. agendadas", 10, INT, "=Base_Semanal!F{r}"); add("Aval. canceladas", 10, INT, "=Base_Semanal!G{r}")
add("Aval. realizadas F1", 10, INT, "=Base_Semanal!H{r}"); add("Aval. realizadas F2", 10, INT, "=Base_Semanal!I{r}"); add("Aval. realizadas total", 10, INT, "=H{r}+I{r}")
add("Taxa canc. avaliações", 10, PCT, "=IF(F{r}=0,\"\",G{r}/F{r})")
add("Contratos F1", 10, INT, "=Base_Semanal!J{r}"); add("Contratos F2", 10, INT, "=Base_Semanal!K{r}"); add("Contratos total", 10, INT, "=L{r}+M{r}")
add("Conversão aval→contrato", 11, PCT, "=IF(J{r}=0,\"\",N{r}/J{r})")
add("Atend. F1", 10, INT, "=Base_Semanal!L{r}"); add("Atend. F2", 10, INT, "=Base_Semanal!M{r}"); add("Atend. total", 10, INT, "=P{r}+Q{r}")
add("Cancelamentos atend.", 11, INT, "=Base_Semanal!N{r}"); add("Novos pacientes", 10, INT, "=Base_Semanal!O{r}")
add("Ocupação manhã", 10, PCT, "=IF(Base_Semanal!P{r}=0,\"\",Base_Semanal!Q{r}/Base_Semanal!P{r})")
add("Ocupação tarde", 10, PCT, "=IF(Base_Semanal!R{r}=0,\"\",Base_Semanal!S{r}/Base_Semanal!R{r})")
add("Ocupação total", 10, PCT, "=IF(Base_Semanal!P{r}+Base_Semanal!R{r}=0,\"\",(Base_Semanal!Q{r}+Base_Semanal!S{r})/(Base_Semanal!P{r}+Base_Semanal!R{r}))")
add("Tempo médio F1", 10, DEC, "=Base_Semanal!T{r}"); add("Desvio F1", 10, DEC, "=Base_Semanal!U{r}"); add("Tempo médio F2", 10, DEC, "=Base_Semanal!V{r}"); add("Desvio F2", 10, DEC, "=Base_Semanal!W{r}")
add("Aval. contratadas (qtd)", 11, INT, f"=COUNTIFS({CT('B')},$A{{r}},{CT('E')},\"Avaliação\")")
add("Valor avaliações", 13, BRL, f"=SUMIFS({CT('I')},{CT('B')},$A{{r}},{CT('E')},\"Avaliação\")")
add("Protocolos contratados (qtd)", 11, INT, f"=COUNTIFS({CT('B')},$A{{r}},{CT('E')},\"Protocolo\")")
add("Valor protocolos", 13, BRL, f"=SUMIFS({CT('I')},{CT('B')},$A{{r}},{CT('E')},\"Protocolo\")")
add("Valor total contratado", 13, BRL, "=AC{r}+AE{r}")
add("Contratos à vista (qtd)", 10, INT, f"=COUNTIFS({CT('B')},$A{{r}},{CT('J')},\"À vista\")")
add("Contratos parcelados (qtd)", 10, INT, f"=COUNTIFS({CT('B')},$A{{r}},{CT('J')},\"Parcelado\")")
add("Receitas", 13, BRL, f"=SUMIFS({FN('G')},{FN('B')},$A{{r}},{FN('D')},\"Receita\",{FN('H')},\"<>Cancelado\")")
add("Gastos", 13, BRL, f"=SUMIFS({FN('G')},{FN('B')},$A{{r}},{FN('D')},\"Gasto\",{FN('H')},\"<>Cancelado\")")
add("Impostos", 13, BRL, f"=SUMIFS({FN('G')},{FN('B')},$A{{r}},{FN('D')},\"Imposto\",{FN('H')},\"<>Cancelado\")")
add("Marketing", 13, BRL, f"=SUMIFS({FN('G')},{FN('B')},$A{{r}},{FN('D')},\"Marketing\",{FN('H')},\"<>Cancelado\")")
add("Resultado", 13, BRL, "=AI{r}-AJ{r}-AK{r}-AL{r}")
add("Receita vs meta", 10, PCT, f"=IF(Config!$B${META['Receita']}=0,\"\",AI{{r}}/Config!$B${META['Receita']})")
add("Gastos vs meta", 10, PCT, f"=IF(Config!$B${META['Gastos']}=0,\"\",AJ{{r}}/Config!$B${META['Gastos']})")
add("CAC (marketing / novos pac.)", 12, BRL, "=IF(T{r}=0,\"\",AL{r}/T{r})")
add("Receita acum. mês", 13, BRL, "=SUMIFS($AI${0}:$AI${1},$D${0}:$D${1},$D{{r}},$B${0}:$B${1},\"<=\"&$B{{r}})".format(WROW1 + 2, WROWN + 2))
add("Gastos acum. mês", 13, BRL, "=SUMIFS($AJ${0}:$AJ${1},$D${0}:$D${1},$D{{r}},$B${0}:$B${1},\"<=\"&$B{{r}})".format(WROW1 + 2, WROWN + 2))
add("Leads por canal (soma)", 10, INT, f"=SUMIFS({LC('C')},{LC('A')},$A{{r}})")
add("Checagem leads", 12, None, "=IF(E{r}=0,\"\",IF(E{r}=AR{r},\"OK\",\"Divergente\"))")
add("Checagem contratos", 12, None, "=IF(N{r}=0,\"\",IF(N{r}=AD{r},\"OK\",\"Divergente\"))")
header(rw, HR, [c[0] for c in rw_cols], [c[1] for c in rw_cols])
for i in range(NW):
    r = 4 + i
    for ci, c in enumerate(rw_cols, 1):
        rw.cell(row=r, column=ci, value=c[3].format(r=r))
for ci, c in enumerate(rw_cols, 1):
    style_range(rw, 4, 3 + NW, ci, ci, fmt=c[2])
    RW[c[0]] = L(ci)
rw.freeze_panes = "E4"
rw.cell(row=5 + NW, column=1, value="Semanas sem dados aparecem com zeros. 'Checagem' compara Base_Semanal com Leads_Canal e Contratos (Divergente = revisar os lançamentos).").font = f_sub
for c in rw_cols: DICT.append(("Resumo_Semanal", c[0], "automático", "Calculado"))
RWR = lambda name: f"Resumo_Semanal!${RW[name]}$4:${RW[name]}${3+NW}"

# ---------------------------------------------------------------- Resumo_Mensal
rm = wb.create_sheet("Resumo_Mensal")
title(rm, "Resumo mensal (calculado)", "Semanas são atribuídas ao mês da sua data de início; contratos e lançamentos financeiros, ao mês da sua própria data.")
rm_cols = []
def addm(name, w, fmt, f): rm_cols.append((name, w, fmt, f))
S = lambda col: f"SUMIFS({BSR(col)},{BSR('D')},$A{{r}})"
addm("Mês", 9, None, None)
addm("Leads recebidos", 10, INT, "=" + S('E')); addm("Aval. agendadas", 10, INT, "=" + S('F')); addm("Aval. canceladas", 10, INT, "=" + S('G'))
addm("Aval. realizadas F1", 10, INT, "=" + S('H')); addm("Aval. realizadas F2", 10, INT, "=" + S('I')); addm("Aval. realizadas total", 10, INT, "=E{r}+F{r}")
addm("Taxa canc. avaliações", 10, PCT, "=IF(C{r}=0,\"\",D{r}/C{r})")
addm("Contratos F1", 10, INT, "=" + S('J')); addm("Contratos F2", 10, INT, "=" + S('K')); addm("Contratos total", 10, INT, "=I{r}+J{r}")
addm("Conversão aval→contrato", 11, PCT, "=IF(G{r}=0,\"\",K{r}/G{r})")
addm("Atend. F1", 10, INT, "=" + S('L')); addm("Atend. F2", 10, INT, "=" + S('M')); addm("Atend. total", 10, INT, "=M{r}+N{r}")
addm("Cancelamentos atend.", 11, INT, "=" + S('N')); addm("Novos pacientes", 10, INT, "=" + S('O'))
addm("Ocupação manhã", 10, PCT, f"=IF({S('P')}=0,\"\",{S('Q')}/{S('P')})")
addm("Ocupação tarde", 10, PCT, f"=IF({S('R')}=0,\"\",{S('S')}/{S('R')})")
addm("Ocupação total", 10, PCT, f"=IF({S('P')}+{S('R')}=0,\"\",({S('Q')}+{S('S')})/({S('P')}+{S('R')}))")
addm("Aval. contratadas (qtd)", 11, INT, f"=COUNTIFS({CT('C')},$A{{r}},{CT('E')},\"Avaliação\")")
addm("Valor avaliações", 13, BRL, f"=SUMIFS({CT('I')},{CT('C')},$A{{r}},{CT('E')},\"Avaliação\")")
addm("Protocolos contratados (qtd)", 11, INT, f"=COUNTIFS({CT('C')},$A{{r}},{CT('E')},\"Protocolo\")")
addm("Valor protocolos", 13, BRL, f"=SUMIFS({CT('I')},{CT('C')},$A{{r}},{CT('E')},\"Protocolo\")")
addm("Receitas", 13, BRL, f"=SUMIFS({FN('G')},{FN('C')},$A{{r}},{FN('D')},\"Receita\",{FN('H')},\"<>Cancelado\")")
addm("Gastos", 13, BRL, f"=SUMIFS({FN('G')},{FN('C')},$A{{r}},{FN('D')},\"Gasto\",{FN('H')},\"<>Cancelado\")")
addm("Impostos", 13, BRL, f"=SUMIFS({FN('G')},{FN('C')},$A{{r}},{FN('D')},\"Imposto\",{FN('H')},\"<>Cancelado\")")
addm("Marketing", 13, BRL, f"=SUMIFS({FN('G')},{FN('C')},$A{{r}},{FN('D')},\"Marketing\",{FN('H')},\"<>Cancelado\")")
addm("Resultado", 13, BRL, "=Y{r}-Z{r}-AA{r}-AB{r}")
addm("Receita vs meta mensal", 10, PCT, f"=IF(Config!$C${META['Receita']}=0,\"\",Y{{r}}/Config!$C${META['Receita']})")
addm("Gastos vs meta mensal", 10, PCT, f"=IF(Config!$C${META['Gastos']}=0,\"\",Z{{r}}/Config!$C${META['Gastos']})")
addm("CAC (marketing / novos pac.)", 12, BRL, "=IF(Q{r}=0,\"\",AB{r}/Q{r})")
header(rm, HR, [c[0] for c in rm_cols], [c[1] for c in rm_cols])
for i, m in enumerate(months):
    r = 4 + i
    rm.cell(row=r, column=1, value=m)
    for ci, c in enumerate(rm_cols[1:], 2):
        rm.cell(row=r, column=ci, value=c[3].format(r=r))
for ci, c in enumerate(rm_cols, 1):
    style_range(rm, 4, 3 + len(months), ci, ci, fmt=c[2])
rm.freeze_panes = "B4"
for c in rm_cols: DICT.append(("Resumo_Mensal", c[0], "automático", "Calculado por mês"))

# ---------------------------------------------------------------- Painel_Semanal
pn = wb.create_sheet("Painel_Semanal", 0)
pn.sheet_view.showGridLines = False
title(pn, "Painel de resultados — reunião semanal", "Escolha a semana na célula amarela (C3). Tudo o mais é calculado.")
for c, w in zip("ABCDEFGHI", [3, 42, 16, 16, 12, 14, 14, 16, 14]):
    pn.column_dimensions[c].width = w
pn["B3"] = "Semana selecionada"; pn["B3"].font = f_bold
pn["C3"] = "2026-S40"; pn["C3"].fill = fill_in; pn["C3"].font = f_bold; pn["C3"].border = border; pn["C3"].alignment = center
dv(pn, "C3", CAL_A)
pn["D3"] = "Semana anterior"; pn["D3"].font = f_bold
pn["E3"] = f"=IFERROR(INDEX({CAL_A},MATCH($C$3,{CAL_A},0)-1),\"\")"; pn["E3"].border = border; pn["E3"].alignment = center
pn["F3"] = "Próxima semana"; pn["F3"].font = f_bold
pn["G3"] = f"=IFERROR(INDEX({CAL_A},MATCH($C$3,{CAL_A},0)+1),\"\")"; pn["G3"].border = border; pn["G3"].alignment = center
pn["B4"] = "Período"; pn["B4"].font = f_bold
pn["C4"] = f"=IFERROR(INDEX({CAL_B},MATCH($C$3,{CAL_A},0)),\"\")"; pn["C4"].number_format = DT
pn["D4"] = f"=IFERROR(INDEX({CAL_C},MATCH($C$3,{CAL_A},0)),\"\")"; pn["D4"].number_format = DT
pn["B5"] = "Mês"; pn["B5"].font = f_bold
pn["C5"] = f"=IFERROR(INDEX({CAL_D},MATCH($C$3,{CAL_A},0)),\"\")"
for a in ("C4", "D4", "C5"): pn[a].border = border; pn[a].alignment = center; pn[a].font = f_norm

def R(name, wk="$C$3"):
    return f"IFERROR(INDEX({RWR(name)},MATCH({wk},{RWR('id_semana')},0)),\"\")"
def RS_(col):
    return f"=IFERROR(INDEX({RS(col)},MATCH($C$3,{RS('A')},0)),\"\")"
def ACC(name):
    return f"=SUMIFS({RWR(name)},{RWR('Mês')},$C$5,{RWR('Início')},\"<=\"&$C$4)"

row = 7
def section(text):
    global row
    c = pn.cell(row=row, column=2, value=text); c.font = f_head; c.fill = fill_head
    for cc in range(3, 10): pn.cell(row=row, column=cc).fill = fill_head
    pn.row_dimensions[row].height = 20
    row += 1
def kpi_header():
    global row
    for ci, h in enumerate(["Indicador", "Semana atual", "Semana anterior", "Variação", "Meta semanal", "% da meta", "Acumulado no mês", "Meta mensal"], 2):
        c = pn.cell(row=row, column=ci, value=h); c.font = f_bold; c.fill = fill_sec; c.border = border; c.alignment = center
    row += 1
def kpi(label, name, fmt, meta_key=None, acc=True, var_pct=False):
    global row
    pn.cell(row=row, column=2, value=label)
    pn.cell(row=row, column=3, value="=" + R(name))
    pn.cell(row=row, column=4, value="=" + R(name, "$E$3"))
    pn.cell(row=row, column=5, value=f"=IF(OR(C{row}=\"\",D{row}=\"\"),\"\",C{row}-D{row})")
    if meta_key:
        pn.cell(row=row, column=6, value=f"=Config!$B${META[meta_key]}")
        pn.cell(row=row, column=7, value=f"=IF(OR(C{row}=\"\",F{row}=0),\"\",C{row}/F{row})")
        pn.cell(row=row, column=9, value=f"=Config!$C${META[meta_key]}")
    if acc:
        pn.cell(row=row, column=8, value=ACC(name))
    style_range(pn, row, row, 2, 9)
    for cc in (3, 4, 5, 6, 8, 9): pn.cell(row=row, column=cc).number_format = fmt
    pn.cell(row=row, column=7).number_format = PCT
    for cc in range(3, 10): pn.cell(row=row, column=cc).alignment = center
    row += 1
def text_row(label, formula, height=45):
    global row
    pn.cell(row=row, column=2, value=label).font = f_bold
    pn.merge_cells(start_row=row, start_column=3, end_row=row, end_column=9)
    pn.cell(row=row, column=3, value=formula)
    style_range(pn, row, row, 2, 9, align=wrap)
    pn.cell(row=row, column=2).font = f_bold
    pn.row_dimensions[row].height = height
    row += 1
def blank():
    global row; row += 1

# Abertura
section("1. ABERTURA")
pn.cell(row=row, column=2, value="Resultado geral (automático — leads, avaliações, contratos, atendimentos, receita e gastos vs. semana anterior)")
score = ("SIGN(N({a1})-N({b1}))+SIGN(N({a2})-N({b2}))+SIGN(N({a3})-N({b3}))+SIGN(N({a4})-N({b4}))+SIGN(N({a5})-N({b5}))-SIGN(N({a6})-N({b6}))").format(
    a1=R("Leads recebidos"), b1=R("Leads recebidos", "$E$3"), a2=R("Aval. realizadas total"), b2=R("Aval. realizadas total", "$E$3"),
    a3=R("Contratos total"), b3=R("Contratos total", "$E$3"), a4=R("Atend. total"), b4=R("Atend. total", "$E$3"),
    a5=R("Receitas"), b5=R("Receitas", "$E$3"), a6=R("Gastos"), b6=R("Gastos", "$E$3"))
pn.cell(row=row, column=3, value=f"=IF($C$3=\"\",\"\",IF(({score})>0,\"Melhor\",IF(({score})<0,\"Pior\",\"Igual\")))")
style_range(pn, row, row, 2, 3); pn.cell(row=row, column=3).alignment = center; pn.cell(row=row, column=3).font = f_bold
pn.cell(row=row, column=2).alignment = wrap; pn.row_dimensions[row].height = 30
row += 1
pn.cell(row=row, column=2, value="Resultado geral (registrado na reunião)")
pn.cell(row=row, column=3, value=RS_("B")); style_range(pn, row, row, 2, 3); pn.cell(row=row, column=3).alignment = center; pn.cell(row=row, column=3).font = f_bold
row += 1
text_row("Pontos positivos", RS_("C")); text_row("Pontos a melhorar", RS_("D")); blank()

# Indicadores-chave: Crescimento
section("2. INDICADORES-CHAVE — CRESCIMENTO")
kpi_header()
kpi("Leads recebidos", "Leads recebidos", INT, "Leads recebidos")
kpi("Novos pacientes", "Novos pacientes", INT, "Novos pacientes")
kpi("Avaliações agendadas", "Aval. agendadas", INT)
kpi("Avaliações canceladas", "Aval. canceladas", INT)
kpi("Taxa de cancelamento de avaliações", "Taxa canc. avaliações", PCT, "Taxa máx. de cancelamento de avaliações", acc=False)
kpi("Avaliações realizadas — total", "Aval. realizadas total", INT, "Avaliações realizadas")
r_f1 = row; kpi("", "Aval. realizadas F1", INT); pn.cell(row=r_f1, column=2, value=f"=\"Avaliações realizadas — \"&{FISIO1}")
r_f2 = row; kpi("", "Aval. realizadas F2", INT); pn.cell(row=r_f2, column=2, value=f"=\"Avaliações realizadas — \"&{FISIO2}")
kpi("Tratamentos contratados — total", "Contratos total", INT, "Contratos fechados (tratamentos)")
r_c1 = row; kpi("", "Contratos F1", INT); pn.cell(row=r_c1, column=2, value=f"=\"Tratamentos contratados — \"&{FISIO1}")
r_c2 = row; kpi("", "Contratos F2", INT); pn.cell(row=r_c2, column=2, value=f"=\"Tratamentos contratados — \"&{FISIO2}")
kpi("Conversão avaliação → contrato", "Conversão aval→contrato", PCT, "Conversão avaliação → contrato", acc=False)
kpi("Avaliações contratadas (qtd)", "Aval. contratadas (qtd)", INT)
kpi("Valor de avaliações contratadas", "Valor avaliações", BRL)
kpi("Protocolos contratados (qtd)", "Protocolos contratados (qtd)", INT)
kpi("Valor de protocolos contratados", "Valor protocolos", BRL)
kpi("Contratos à vista (qtd)", "Contratos à vista (qtd)", INT)
kpi("Contratos parcelados (qtd)", "Contratos parcelados (qtd)", INT)
blank()
pn.cell(row=row, column=2, value="Meios de comunicação de ingresso (leads por canal)").font = f_bold; row += 1
for ci, h in enumerate(["Canal", "Semana atual", "Semana anterior", "Variação", "% do total (atual)"], 2):
    c = pn.cell(row=row, column=ci, value=h); c.font = f_bold; c.fill = fill_sec; c.border = border; c.alignment = center
row += 1
canal_start = row
for k in range(len(lists["Canal de ingresso"])):
    src = f"Config!$I${10+k}"
    pn.cell(row=row, column=2, value=f"={src}")
    pn.cell(row=row, column=3, value=f"=SUMIFS({LC('C')},{LC('A')},$C$3,{LC('B')},{src})")
    pn.cell(row=row, column=4, value=f"=SUMIFS({LC('C')},{LC('A')},$E$3,{LC('B')},{src})")
    pn.cell(row=row, column=5, value=f"=C{row}-D{row}")
    pn.cell(row=row, column=6, value=f"=IF(SUM($C${canal_start}:$C${canal_start+len(lists['Canal de ingresso'])-1})=0,\"\",C{row}/SUM($C${canal_start}:$C${canal_start+len(lists['Canal de ingresso'])-1}))")
    style_range(pn, row, row, 2, 6); pn.cell(row=row, column=6).number_format = PCT
    for cc in range(3, 7): pn.cell(row=row, column=cc).alignment = center
    row += 1
blank()

# Agenda e atendimentos
section("3. AGENDA E ATENDIMENTOS")
kpi_header()
r1 = row; kpi("", "Atend. F1", INT); pn.cell(row=r1, column=2, value=f"=\"Atendimentos realizados — \"&{FISIO1}")
r2 = row; kpi("", "Atend. F2", INT); pn.cell(row=r2, column=2, value=f"=\"Atendimentos realizados — \"&{FISIO2}")
kpi("Atendimentos realizados — total", "Atend. total", INT, "Atendimentos realizados")
kpi("Cancelamentos de atendimentos", "Cancelamentos atend.", INT)
kpi("Taxa de ocupação — manhã", "Ocupação manhã", PCT, "Taxa de ocupação da agenda", acc=False)
kpi("Taxa de ocupação — tarde", "Ocupação tarde", PCT, "Taxa de ocupação da agenda", acc=False)
kpi("Taxa de ocupação — total", "Ocupação total", PCT, "Taxa de ocupação da agenda", acc=False)
r1 = row; kpi("", "Tempo médio F1", DEC, acc=False); pn.cell(row=r1, column=2, value=f"=\"Tempo médio de atendimento (min) — \"&{FISIO1}")
r1 = row; kpi("", "Desvio F1", DEC, acc=False); pn.cell(row=r1, column=2, value=f"=\"Desvio padrão (min) — \"&{FISIO1}")
r1 = row; kpi("", "Tempo médio F2", DEC, acc=False); pn.cell(row=r1, column=2, value=f"=\"Tempo médio de atendimento (min) — \"&{FISIO2}")
r1 = row; kpi("", "Desvio F2", DEC, acc=False); pn.cell(row=r1, column=2, value=f"=\"Desvio padrão (min) — \"&{FISIO2}")
blank()

# Financeiras
section("4. INDICADORES FINANCEIROS")
kpi_header()
kpi("Receita semanal", "Receitas", BRL, "Receita")
kpi("Gastos semanais", "Gastos", BRL, "Gastos")
kpi("Impostos", "Impostos", BRL)
kpi("Investimento em marketing", "Marketing", BRL, "Investimento em marketing")
kpi("Resultado (receita − gastos − impostos − marketing)", "Resultado", BRL)
kpi("CAC (marketing / novos pacientes)", "CAC (marketing / novos pac.)", BRL, acc=False)
pn.cell(row=row, column=2, value="Pendências — receitas a receber (status Pendente)")
pn.cell(row=row, column=3, value=f"=SUMIFS({FN('G')},{FN('D')},\"Receita\",{FN('H')},\"Pendente\")")
pn.cell(row=row, column=4, value=f"=COUNTIFS({FN('D')},\"Receita\",{FN('H')},\"Pendente\")&\" lançamento(s)\"")
style_range(pn, row, row, 2, 4); pn.cell(row=row, column=3).number_format = BRL
for cc in (3, 4): pn.cell(row=row, column=cc).alignment = center
row += 1
pn.cell(row=row, column=2, value="Inadimplência — receitas em atraso (status Atrasado)")
pn.cell(row=row, column=3, value=f"=SUMIFS({FN('G')},{FN('D')},\"Receita\",{FN('H')},\"Atrasado\")")
pn.cell(row=row, column=4, value=f"=COUNTIFS({FN('D')},\"Receita\",{FN('H')},\"Atrasado\")&\" lançamento(s)\"")
style_range(pn, row, row, 2, 4); pn.cell(row=row, column=3).number_format = BRL
for cc in (3, 4): pn.cell(row=row, column=cc).alignment = center
row += 1
pn.cell(row=row, column=2, value="Pendências e inadimplência consideram todos os lançamentos em aberto, independentemente da semana.").font = f_sub
row += 1; blank()

# Experiência do paciente
section("5. EXPERIÊNCIA DO PACIENTE")
text_row("Pacientes críticos | riscos de desistência", RS_("E"))
text_row("Pontos pertinentes", RS_("F"))
text_row("Problemas no atendimento", RS_("G"))
pn.cell(row=row, column=2, value="Existe algo prejudicando a experiência do paciente?").font = f_bold
pn.cell(row=row, column=3, value=RS_("H")); style_range(pn, row, row, 2, 3); pn.cell(row=row, column=2).font = f_bold; pn.cell(row=row, column=3).alignment = center
row += 1
text_row("Descrição", RS_("I")); blank()

# Operação da semana / próxima semana
section("6. OPERAÇÃO DA SEMANA | PRÓXIMA SEMANA")
for ci, h in enumerate(["Agenda da próxima semana", "Ocupação já agendada", "Meta"], 2):
    c = pn.cell(row=row, column=ci, value=h); c.font = f_bold; c.fill = fill_sec; c.border = border; c.alignment = center
row += 1
for lbl, nm in [("Taxa de ocupação — manhã", "Ocupação manhã"), ("Taxa de ocupação — tarde", "Ocupação tarde"), ("Taxa de ocupação — total", "Ocupação total")]:
    pn.cell(row=row, column=2, value=lbl)
    pn.cell(row=row, column=3, value="=" + R(nm, "$G$3"))
    pn.cell(row=row, column=4, value=f"=Config!$B${META['Taxa de ocupação da agenda']}")
    style_range(pn, row, row, 2, 4, fmt=PCT); pn.cell(row=row, column=2).number_format = "General"
    for cc in (3, 4): pn.cell(row=row, column=cc).alignment = center
    row += 1
pn.cell(row=row, column=2, value="Preencha os horários disponíveis/ocupados da próxima semana na Base_Semanal para ver a ocupação já agendada.").font = f_sub
row += 1
text_row("Demandas da recepção e equipe", RS_("J"))
text_row("Pontos relevantes", RS_("K")); blank()

section("7. O QUE MAIS OCORRER")
text_row("Outros pontos", RS_("L")); blank()

# Plano de ação
section("8. PLANO DE AÇÃO")
text_row("Metas da semana", RS_("M"))
text_row("Soluções para os problemas identificados", RS_("N"))
pn.cell(row=row, column=2, value="Ações para executar (5W2H) — até 8 ações da semana; lista completa na aba Plano_Acao").font = f_bold; row += 1
hdrs = ["Problema / meta", "O quê", "Por quê", "Onde", "Quando", "Quem", "Como", "Status"]
pa_src = ["C", "D", "E", "F", "G", "H", "I", "K"]
for ci, h in enumerate(hdrs, 2):
    c = pn.cell(row=row, column=ci, value=h); c.font = f_bold; c.fill = fill_sec; c.border = border; c.alignment = center
row += 1
for k in range(1, 9):
    for ci, src in enumerate(pa_src, 2):
        pn.cell(row=row, column=ci, value=f"=IFERROR(INDEX({PA(src)},MATCH($C$3&\"-{k}\",{PA('L')},0)),\"\")")
    style_range(pn, row, row, 2, 9, align=wrap); pn.cell(row=row, column=6).number_format = DT
    pn.row_dimensions[row].height = 36
    row += 1
pn.freeze_panes = "A7"

# ---------------------------------------------------------------- Leia-me
lm = wb.create_sheet("Leia-me", 0)
lm.column_dimensions["A"].width = 22; lm.column_dimensions["B"].width = 36; lm.column_dimensions["C"].width = 14; lm.column_dimensions["D"].width = 70
title(lm, "Base de dados da clínica — estrutura e orientações", "Planilha-base para alimentar o SaaS e o painel da reunião semanal.")
lm["A4"] = "Legenda"; lm["A4"].font = f_bold
lm["A5"] = "Célula amarela"; lm["A5"].fill = fill_in; lm["A5"].border = border; lm["B5"] = "Preencher (dado coletado)"
lm["A6"] = "Célula branca"; lm["A6"].border = border; lm["B6"] = "Calculada automaticamente — não editar"
lm["A8"] = "Fluxo de uso"; lm["A8"].font = f_bold
steps = [
    "1. Config: confirme os nomes dos fisioterapeutas (Fisio 1 / Fisio 2), as metas semanais e mensais e as listas de opções.",
    "2. Base_Semanal: ao fim de cada semana, preencha a linha da semana (leads, avaliações, contratos, atendimentos, agenda, tempos).",
    "3. Contratos: registre cada avaliação ou protocolo contratado com valor, condição e forma de pagamento e canal de ingresso.",
    "4. Financeiro: registre receitas, gastos, impostos e marketing; use o status para pendências (Pendente) e inadimplência (Atrasado).",
    "5. Leads_Canal: distribua os leads da semana por canal (meios de comunicação de ingresso).",
    "6. Reuniao_Semanal e Plano_Acao: registre o qualitativo da reunião e as ações 5W2H.",
    "7. Painel_Semanal: escolha a semana na célula C3 e conduza a reunião pelo painel. Resumo_Semanal e Resumo_Mensal consolidam tudo.",
]
for i, s in enumerate(steps):
    lm.cell(row=9 + i, column=1, value=s).font = f_norm
lm["A17"] = "Premissas"; lm["A17"].font = f_bold
prem = [
    "Semanas seguem o padrão ISO (segunda a domingo), identificadas como AAAA-Sww; o mês de uma semana é o mês da sua data de início.",
    "Contratos e lançamentos financeiros recebem semana e mês automaticamente pela data informada.",
    "As linhas marcadas como 'Exemplo' (semanas 2026-S39, S40 e S41) são ilustrativas e devem ser substituídas pelos dados reais.",
    "Lançamentos com status Cancelado não entram nos totais financeiros.",
    "O 'Resultado geral (automático)' do painel compara seis indicadores com a semana anterior; o resultado registrado pela equipe fica na Reuniao_Semanal.",
    "Fórmulas usam SUMIFS/COUNTIFS/INDEX/MATCH, compatíveis com Excel 2007+, LibreOffice e Google Sheets.",
]
for i, s in enumerate(prem):
    lm.cell(row=18 + i, column=1, value=s).font = f_norm
r0 = 26
lm.cell(row=r0, column=1, value="Dicionário de dados (para modelagem do SaaS)").font = f_bold
header(lm, r0 + 1, ["Aba (tabela)", "Campo", "Origem", "Descrição"])
for i, (tab, campo, origem, desc) in enumerate(DICT):
    r = r0 + 2 + i
    lm.cell(row=r, column=1, value=tab); lm.cell(row=r, column=2, value=campo); lm.cell(row=r, column=3, value=origem); lm.cell(row=r, column=4, value=desc)
    style_range(lm, r, r, 1, 4, align=wrap)
lm.freeze_panes = "A4"

# fonts default
for ws in wb.worksheets:
    for rowc in ws.iter_rows():
        for c in rowc:
            if c.value is not None and c.font.name != FONT:
                c.font = Font(name=FONT, size=c.font.size or 10, bold=c.font.bold, italic=c.font.italic, color=c.font.color)

wb.save("/home/claude/work/Base_Dados_Clinica.xlsx")
print("ok", NW, len(months), len(DICT))
