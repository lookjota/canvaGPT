# ADR 001 — Motor do canvas

## Decisão

O Orion usa um motor próprio de renderização com DOM para nodes e SVG para edges. Nodes e edges vivem no domínio como entidades independentes da camada visual; o canvas aplica `left = worldX * zoom + viewportX` e equivalente para Y.

## Motivos

O núcleo atual precisa de pan/zoom, persistência de viewport, resize e edges sem exigir o modelo de dados de uma biblioteca. A solução tem pouca superfície de dependência e deixa a evolução para centenas de objetos explícita: selectors granulares, debounce e, quando necessário, virtualização por viewport.

## Consequências

Há mais código de interação para manter, especialmente marquee, pan e conexões. A geometria de edge é derivada dos nodes e nunca persistida.

## Interações da Fase 2B

O modo Selecionar usa clique simples para seleção exclusiva, Ctrl/Cmd + clique para alternância e pointer down no fundo para marquee. O modo Mover tela e o botão do meio fazem pan; cabeçalhos fazem drag de node (ou do grupo selecionado), enquanto resize e handles de conexão têm zonas próprias. Marquee e drag convertem coordenadas de tela para mundo usando o viewport atual, portanto permanecem corretos em qualquer zoom. Escape cancela marquee/conexão e limpa a seleção; atalhos de delete e duplicação são ignorados em controles textuais.

Edges persistem apenas sua relação lógica. Endpoints, arrowhead e labels são calculados em SVG a cada render a partir das dimensões e posições atuais dos nodes.
