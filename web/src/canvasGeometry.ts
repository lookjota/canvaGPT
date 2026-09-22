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
export type EdgeAnchor = 'top' | 'right' | 'bottom' | 'left';
export type EdgeCurve = { start: Point; control1: Point; control2: Point; end: Point; midpoint: Point; sourceAnchor: EdgeAnchor; targetAnchor: EdgeAnchor };

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

export function panViewport(viewport: Viewport, screenDelta: Point): Viewport {
  const view = normalizeViewport(viewport);
  return { ...view, x: view.x + screenDelta.x, y: view.y + screenDelta.y };
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
  const curve = edgeCurve(source, target);
  return { start: curve.start, end: curve.end };
}

function center(node: GeometryNode): Point { return { x: node.positionX + node.width / 2, y: node.positionY + node.height / 2 }; }

export function chooseEdgeAnchors(source: GeometryNode, target: GeometryNode): { sourceAnchor: EdgeAnchor; targetAnchor: EdgeAnchor } {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { sourceAnchor: 'right', targetAnchor: 'left' } : { sourceAnchor: 'left', targetAnchor: 'right' };
  return dy >= 0 ? { sourceAnchor: 'bottom', targetAnchor: 'top' } : { sourceAnchor: 'top', targetAnchor: 'bottom' };
}

export function anchorPoint(node: GeometryNode, anchor: EdgeAnchor): Point {
  const x = node.positionX;
  const y = node.positionY;
  if (anchor === 'top') return { x: x + node.width / 2, y };
  if (anchor === 'right') return { x: x + node.width, y: y + node.height / 2 };
  if (anchor === 'bottom') return { x: x + node.width / 2, y: y + node.height };
  return { x, y: y + node.height / 2 };
}

function anchorDirection(anchor: EdgeAnchor): Point {
  if (anchor === 'top') return { x: 0, y: -1 };
  if (anchor === 'right') return { x: 1, y: 0 };
  if (anchor === 'bottom') return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function curvature(source: GeometryNode, target: GeometryNode, sourceAnchor: EdgeAnchor, targetAnchor: EdgeAnchor): number {
  const a = anchorPoint(source, sourceAnchor);
  const b = anchorPoint(target, targetAnchor);
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.min(180, Math.max(48, distance * 0.35));
}

export function edgeCurve(source: GeometryNode, target: GeometryNode, offset = 0): EdgeCurve {
  const { sourceAnchor, targetAnchor } = chooseEdgeAnchors(source, target);
  const start = anchorPoint(source, sourceAnchor);
  const end = anchorPoint(target, targetAnchor);
  const sourceDirection = anchorDirection(sourceAnchor);
  const targetDirection = anchorDirection(targetAnchor);
  const distance = curvature(source, target, sourceAnchor, targetAnchor);
  const perpendicular = { x: -sourceDirection.y, y: sourceDirection.x };
  const control1 = { x: start.x + sourceDirection.x * distance + perpendicular.x * offset, y: start.y + sourceDirection.y * distance + perpendicular.y * offset };
  const control2 = { x: end.x + targetDirection.x * distance + perpendicular.x * offset, y: end.y + targetDirection.y * distance + perpendicular.y * offset };
  return { start, control1, control2, end, midpoint: cubicBezierPoint(start, control1, control2, end, 0.5), sourceAnchor, targetAnchor };
}

export function cubicBezierPoint(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u ** 3 * start.x + 3 * u ** 2 * t * control1.x + 3 * u * t ** 2 * control2.x + t ** 3 * end.x,
    y: u ** 3 * start.y + 3 * u ** 2 * t * control1.y + 3 * u * t ** 2 * control2.y + t ** 3 * end.y,
  };
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
