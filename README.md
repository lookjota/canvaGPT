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

## Comandos

`npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:studio`.

## Arquitetura

`server/src` contém API, autenticação e autorização; `web/src` contém rotas, dashboard e canvas; `prisma/schema.prisma` é a fonte do modelo persistente. A autorização é verificada no backend em toda operação de projeto, node, edge e viewport. O owner recebe membership `owner` na criação do projeto.

O canvas usa coordenadas de mundo, SVG para setas e debounce de 600 ms para edição/movimento. Consulte `docs/adr-001-canvas-engine.md`.

## Limitações conhecidas desta etapa

Reset de senha, upload real, marquee/pan por gesto, undo/redo e colaboração realtime ainda não estão implementados. A conexão por handles está preparada visualmente, mas a conclusão de uma edge e a edição semântica precisam ser fechadas antes do gate final 2B. Não declarar o núcleo completo até executar o roteiro manual e testes de isolamento com PostgreSQL.
# canvaGPT
