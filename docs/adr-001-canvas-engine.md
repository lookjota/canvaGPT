# ADR 001 — Motor do canvas

## Decisão

O Orion usa um motor próprio de renderização com DOM para nodes e SVG para edges. Nodes e edges vivem no domínio como entidades independentes da camada visual; o canvas aplica `left = worldX * zoom + viewportX` e equivalente para Y.

## Motivos

O núcleo atual precisa de pan/zoom, persistência de viewport, resize e edges sem exigir o modelo de dados de uma biblioteca. A solução tem pouca superfície de dependência e deixa a evolução para centenas de objetos explícita: selectors granulares, debounce e, quando necessário, virtualização por viewport.

## Consequências

Há mais código de interação para manter, especialmente marquee, pan e conexões. A geometria de edge é derivada dos nodes e nunca persistida.
