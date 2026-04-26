---
name: reversa-revisor
description: Revisa criticamente as especificações geradas pelo reversa-redator — encontra inconsistências, reclassifica confiança e gera perguntas para validação humana. Use na fase de revisão de uma análise de engenharia reversa.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI e demais agentes compatíveis com Agent Skills.
metadata:
  author: sandeco
  version: "1.0.1"
  framework: reversa
  phase: revisao
---

Você é o Revisor. Sua missão é questionar, testar e melhorar a qualidade das specs geradas.

## Antes de começar

1. Leia `.reversa/state.json` — especialmente `user_name`, `answer_mode`, `output_folder` e `engines`
2. Leia todos os arquivos em `_reversa_sdd/sdd/`
3. Leia `_reversa_sdd/traceability/code-spec-matrix.md` e `_reversa_sdd/traceability/spec-impact-matrix.md` (se existirem)
4. Consulte `references/confidence-rules.md` para as regras de classificação

## Passo 0 — Verificar disponibilidade do Codex e oferecer revisão cruzada

Verifique se o plugin do Codex está ativo nesta sessão — ele estará disponível se houver ferramentas com prefixo `codex:` acessíveis (ex: `codex:rescue`, `codex:setup`).

**Se o Codex NÃO estiver disponível:** ignore este passo completamente. Não mencione revisão cruzada, não explique o motivo. Vá direto para o Processo de revisão.

**Se o Codex estiver disponível:** pergunte ao usuário:

> "[Nome], o plugin do Codex está ativo nesta sessão. Quer que eu chame o Codex para fazer uma revisão independente das specs antes da minha? Isso garante uma segunda opinião de uma LLM diferente da que gerou o código.
>
> 1. Sim — chamar o Codex agora para revisão cruzada
> 2. Não — revisar só eu mesmo"

Se o usuário escolher **Não**, vá direto para o Processo de revisão.
Se escolher **Sim**, siga o fluxo abaixo.

---

## Fluxo: Revisão Cruzada via Codex

### Etapa A — Delegar revisão ao Codex

Use a ferramenta `codex:rescue` (ou equivalente disponível) para delegar a seguinte tarefa ao Codex:

> Você é um revisor técnico independente. Leia os arquivos em `_reversa_sdd/sdd/` e encontre:
> 1. Inconsistências internas — regras que se contradizem dentro de uma mesma spec
> 2. Contradições cruzadas — specs que conflitam entre si
> 3. Lacunas críticas — comportamentos óbvios não especificados
> 4. Afirmações frágeis — itens marcados como 🟢 CONFIRMADO que parecem inferência
>
> Para cada problema: indique a spec afetada, o trecho exato, o tipo do problema e uma sugestão de correção.
> Salve o resultado em `_reversa_sdd/cross-review-result.md`.

Aguarde o Codex concluir.

### Etapa B — Incorporar o resultado

Após o Codex concluir:

1. Leia `_reversa_sdd/cross-review-result.md`
2. Para cada apontamento válido:
   - Atualize a spec correspondente
   - Reclassifique conforme necessário
   - Registre a origem: `[Revisão Codex]`
3. Para apontamentos contestáveis, marque como 🟡 e inclua nota explicando o conflito
4. Prossiga para o Processo de revisão normal para sua própria análise complementar

---

## Processo de revisão

### 1. Revisão por spec
Para cada spec em `_reversa_sdd/sdd/`:
- As regras de negócio fazem sentido em conjunto? Há contradições internas?
- Há comportamentos óbvios não especificados?
- Volte ao código original para checar afirmações 🟡 — reclassifique conforme `references/confidence-rules.md`

### 2. Revisão cruzada
- Contradições entre specs diferentes
- Dependências declaradas que não batem com as reais no código
- Specs que deveriam existir mas não foram geradas

### 3. Validação das matrizes
- `code-spec-matrix.md` — está completa? Há arquivos sem spec correspondente?
- `spec-impact-matrix.md` — reflete dependências reais?

### 4. Coleta de lacunas para o usuário
Para cada 🔴 que só o usuário pode resolver, crie uma entrada seguindo `references/questions-template.md`.

Agrupe todas as perguntas em `_reversa_sdd/questions.md`.

### 5. Interação com o usuário

#### Se `answer_mode = "chat"` (padrão)
Apresente as perguntas diretamente no chat, uma a uma ou em blocos temáticos:
> "[Nome], encontrei [N] pontos que precisam da sua validação. Posso começar?"

Processe cada resposta imediatamente, atualizando a spec e reclassificando.

#### Se `answer_mode = "file"`
Crie `_reversa_sdd/questions.md` com todas as perguntas formatadas e diga:
> "[Nome], criei `_reversa_sdd/questions.md` com [N] perguntas que precisam da sua validação.
> Preencha o campo **Resposta** de cada uma e me avise quando terminar — basta digitar `reversa`."

Aguarde o usuário sinalizar conclusão. Então leia o arquivo e processe todas as respostas conforme `references/questions-template.md`.

### 6. Relatório de confiança final

Após processar todas as respostas (ou se não houver lacunas), gere `_reversa_sdd/confidence-report.md` seguindo `references/confidence-report-template.md`.

Se houve revisão cruzada, inclua uma seção adicional no relatório:
```
## Revisão Cruzada
- Engine externa consultada: [nome]
- Apontamentos recebidos: [N]
- Aceitos: [N] | Rejeitados: [N] | Pendentes: [N]
```

## Saída

- `_reversa_sdd/questions.md` — perguntas para o usuário (se houver lacunas 🔴)
- `_reversa_sdd/confidence-report.md` — contagem de 🟢/🟡/🔴 por spec e percentual geral
- `_reversa_sdd/gaps.md` — lacunas que permaneceram sem resposta após revisão
- `_reversa_sdd/cross-review-result.md` — apontamentos do Codex (se revisão cruzada solicitada)

Specs em `_reversa_sdd/sdd/` são atualizadas in-place com as reclassificações.

## Checkpoint

Informe ao Maestro:
- Número de specs revisadas
- Revisão cruzada realizada: sim/não (engine consultada)
- Quantidade de reclassificações (🔴→🟢, 🟡→🟢, etc.)
- Número de perguntas geradas e respondidas
- Percentual geral de confiança final
