export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const MIN_NODE_WIDTH = 160;
export const MIN_NODE_HEIGHT = 100;
export const MAX_NODE_WIDTH = 1200;
export const MAX_NODE_HEIGHT = 1000;

export type Point = { x: number; y: number };
export type Viewport = Point & { zoom: number };
export type CanvasRect = { width: number; height: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type GeometryNode = { positionX: number; positionY: number; width: number; height: number };
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(zoom) ? zoom : 1));
}

export function normalizeViewport(viewport: Viewport): Viewport {
  return { x: Number.isFinite(viewport.x) ? viewport.x : 0, y: Number.isFinite(viewport.y) ? viewport.y : 0, zoom: clampZoom(viewport.zoom) };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  const view = normalizeViewport(viewport);
  return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  const view = normalizeViewport(viewport);
  return { x: point.x * view.zoom + view.x, y: point.y * view.zoom + view.y };
}

export function zoomAroundPoint(viewport: Viewport, screenPoint: Point, nextZoom: number): Viewport {
  const worldPoint = screenToWorld(screenPoint, viewport);
  const zoom = clampZoom(nextZoom);
  return { zoom, x: screenPoint.x - worldPoint.x * zoom, y: screenPoint.y - worldPoint.y * zoom };
}

export function dragDelta(screenDelta: Point, zoom: number): Point {
  const safeZoom = clampZoom(zoom);
  return { x: screenDelta.x / safeZoom, y: screenDelta.y / safeZoom };
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

export function intersectsRect(node: GeometryNode, rect: Rect): boolean {
  return node.positionX < rect.maxX && node.positionX + node.width > rect.minX && node.positionY < rect.maxY && node.positionY + node.height > rect.minY;
}

export function moveNodes<T extends GeometryNode>(nodes: T[], delta: Point): T[] {
  return nodes.map(node => ({ ...node, positionX: node.positionX + delta.x, positionY: node.positionY + delta.y }));
}

export function edgeEndpoints(source: GeometryNode, target: GeometryNode): { start: Point; end: Point } {
  const sourceCenter = { x: source.positionX + source.width / 2, y: source.positionY + source.height / 2 };
  const targetCenter = { x: target.positionX + target.width / 2, y: target.positionY + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const sourceScale = 1 / Math.max(Math.abs(dx) / (source.width / 2), Math.abs(dy) / (source.height / 2), 0.0001);
  const targetScale = 1 / Math.max(Math.abs(dx) / (target.width / 2), Math.abs(dy) / (target.height / 2), 0.0001);
  return { start: { x: sourceCenter.x + dx * sourceScale, y: sourceCenter.y + dy * sourceScale }, end: { x: targetCenter.x - dx * targetScale, y: targetCenter.y - dy * targetScale } };
}

export function constrainNodeSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, Number.isFinite(width) ? width : MIN_NODE_WIDTH)),
    height: Math.min(MAX_NODE_HEIGHT, Math.max(MIN_NODE_HEIGHT, Number.isFinite(height) ? height : MIN_NODE_HEIGHT)),
  };
}

export function boundingBox(nodes: GeometryNode[]): Bounds | null {
  if (!nodes.length) return null;
  return nodes.reduce((bounds, node) => ({
    minX: Math.min(bounds.minX, node.positionX),
    minY: Math.min(bounds.minY, node.positionY),
    maxX: Math.max(bounds.maxX, node.positionX + node.width),
    maxY: Math.max(bounds.maxY, node.positionY + node.height),
  }), { minX: nodes[0].positionX, minY: nodes[0].positionY, maxX: nodes[0].positionX + nodes[0].width, maxY: nodes[0].positionY + nodes[0].height });
}

export function fitView(nodes: GeometryNode[], canvas: CanvasRect, padding = 64): Viewport {
  const bounds = boundingBox(nodes);
  if (!bounds || canvas.width <= 0 || canvas.height <= 0) return { x: 0, y: 0, zoom: 1 };
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clampZoom(Math.min((canvas.width - padding * 2) / contentWidth, (canvas.height - padding * 2) / contentHeight));
  return { zoom, x: (canvas.width - contentWidth * zoom) / 2 - bounds.minX * zoom, y: (canvas.height - contentHeight * zoom) / 2 - bounds.minY * zoom };
}
