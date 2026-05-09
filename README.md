# Precificação 3D Pro

Aplicação web para precificação profissional de serviços de impressão 3D, com backend em Node.js/Express e persistência em SQLite.

## Como rodar localmente

1. Instale as dependências com `npm install`.
2. Inicie o servidor com `npm start`.
3. Abra `http://localhost:3000` no navegador.

## O que fica salvo

- Configurações gerais do negócio
- Cadastro de materiais
- Cadastro de impressoras
- Histórico de orçamentos
- Rascunho do orçamento em edição

Os dados ficam no arquivo SQLite em `data/precificacao.sqlite`.

## O que o sistema calcula

- Custo de material com desperdício
- Custo de energia
- Depreciação por hora da impressora
- Manutenção proporcional por hora
- Diluição do custo de falhas
- Mão de obra total, incluindo pós-processamento
- Custo bruto total
- Break-even considerando taxa de venda
- Preço ideal aplicando margem desejada e complexidade
- Lucro por peça, lucro total e margem real

## Estrutura de cálculo

A lógica principal está em `app.js`, na função `calculateQuote()`.

Fórmulas-chave:

- `peso_total_com_desperdicio = (peso_modelo + suporte) * (1 + desperdicio_material)`
- `energia = (potencia_w / 1000) * horas_totais * custo_kwh`
- `depreciacao = (valor_impressora / vida_util_horas) * horas_totais`
- `manutencao = (manutencao_mensal / horas_produtivas_mes) * horas_totais`
- `falhas = custo_base * (taxa_falha / (1 - taxa_falha))`
- `break_even = custo_bruto / (1 - taxa_marketplace)`
- `preco_ideal = (custo_bruto * (1 + margem + adicional_complexidade)) / (1 - taxa_marketplace)`
- `lucro = receita_liquida - custo_bruto`

## Diferenciais inclusos

- Múltiplas impressoras
- Simulação de cenários
- Histórico persistido em banco
- Resumo de fila de produção
- Exportação de orçamento em texto
- Resumo no histórico por seleção de orçamentos

## Deploy no Render

1. Suba esta pasta para um repositório GitHub.
2. No Render, crie um novo serviço usando o `render.yaml` deste projeto.
3. Mantenha o disco persistente habilitado, porque o SQLite fica em `data/`.
4. Após o deploy, o app vai responder pela rota principal e pela verificação em `/api/bootstrap`.

## Observações

- O botão `Restaurar padrões` zera dados do banco e recria a base inicial.
- Para PDF, é possível imprimir a página pelo navegador e salvar como PDF.
- Em Render, sem disco persistente, o SQLite será perdido a cada novo deploy ou restart.
