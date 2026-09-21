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
