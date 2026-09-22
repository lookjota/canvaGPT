# Orion Workspace

Workspace visual independente para projetos, memória operacional e grafo de execução.

## Estado atual

A fundação TypeScript está implementada: autenticação por cookie httpOnly, dashboard persistente, projeto protegido por membership, schema PostgreSQL/Prisma, nodes, viewport e API de edges. O painel de IA é apenas reserva arquitetural; nenhuma integração de IA é simulada.

## Requisitos

Node 20+, npm 10+ e PostgreSQL 15+ (ou Docker). Copie `.env.example` para `.env`, ajuste `DATABASE_URL` e defina um `JWT_SECRET` longo.

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Frontend: http://localhost:5173. API: http://localhost:4000.

## Conversas Orion AI

Conversas pertencem a um projeto e ao usuário autenticado. O cliente envia somente IDs de nodes; o backend valida membership, carrega nodes/edges do PostgreSQL e cria `MessageContextNode` com snapshots de título, tipo e conteúdo. Apenas edges entre nodes presentes no contexto são enviados ao provider.

O provider padrão usa a Responses API do OpenAI via `OPENAI_API_KEY` e `OPENAI_MODEL`; `AI_PROVIDER=mock` é usado automaticamente em testes e pode ser usado localmente sem uma chave. Se o provider falhar, a mensagem do usuário permanece persistida com seus snapshots e a API retorna `AI_PROVIDER_FAILED`; nenhuma resposta assistant falsa é criada.

Limites atuais: 8.000 caracteres por mensagem, 20 nodes por request e 30.000 caracteres de contexto total. Memórias canônicas usam, por padrão, no máximo 20 registros e 12.000 caracteres (`PROJECT_MEMORY_MAX_ITEMS` e `PROJECT_MEMORY_MAX_CHARS`); a seleção é determinística por prioridade DECISION, FACT, LEARNING, HYPOTHESIS, GAP, depois `updatedAt` mais recente e ID. Uma memória nunca é truncada: se não couber inteira, fica fora da resposta. Os limites podem ser configurados por ambiente.

## Comandos

`npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:studio`.

## Arquitetura

`server/src` contém API, autenticação e autorização; `web/src` contém rotas, dashboard e canvas; `prisma/schema.prisma` é a fonte do modelo persistente. A autorização é verificada no backend em toda operação de projeto, node, edge e viewport. O owner recebe membership `owner` na criação do projeto.

O canvas usa coordenadas de mundo, SVG para setas e debounce de 600 ms para edição/movimento. Consulte `docs/adr-001-canvas-engine.md`.

## Memória canônica por projeto

Memórias canônicas são registros estáveis do projeto, distintos do contexto fixado: o contexto fixado é uma seleção explícita de nodes enviada a uma conversa, enquanto a memória canônica é um registro persistente e classificável. Os tipos são `FACT` (fato), `DECISION` (decisão), `HYPOTHESIS` (hipótese), `GAP` (lacuna) e `LEARNING` (aprendizado); uma hipótese só muda de tipo por edição explícita. Toda memória preserva `sourceType`, `sourceRef` opcional e o usuário criador. Memórias são arquivadas/restauradas, nunca excluídas por estas rotas, e sempre são lidas dentro do projeto da rota.
Ao montar uma resposta, o backend lê somente memórias `ACTIVE` do projeto da rota. Elas entram em uma seção `[PROJECT MEMORY]` separada de `[SELECTED CANVAS CONTEXT]`; hipótese e lacuna recebem marcadores explícitos. Cada mensagem user/assistant recebe snapshots dos IDs, tipo, título, conteúdo usado, confiança, proveniência e `updatedAt`, preservando o histórico após edição ou arquivamento.

## Limitações conhecidas desta etapa

Reset de senha, upload real, marquee/pan por gesto, undo/redo e colaboração realtime ainda não estão implementados. A conexão por handles está preparada visualmente, mas a conclusão de uma edge e a edição semântica precisam ser fechadas antes do gate final 2B. Não declarar o núcleo completo até executar o roteiro manual e testes de isolamento com PostgreSQL.
# canvaGPT
