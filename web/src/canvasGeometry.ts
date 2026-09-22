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
export type EdgeCurve = { start: Point; control1: Point; control2: Point; end: Point; midpoint: Point; sourceAnchor: EdgeAnchor; targetAnchor: EdgeAnchor; path?: string };
export type EdgeRoute = EdgeCurve & { points: Point[]; path: string; labelPoint: Point; length: number; bends: number; routed: boolean };

export const CONNECTION_SNAP_MARGIN = 18;
export const EDGE_CLEARANCE = 28;
export const EDGE_EXIT_DISTANCE = 72;

export function isEditableTarget(target: EventTarget | null): boolean {
  let current: any = target;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const tagName = typeof current.tagName === 'string' ? current.tagName.toUpperCase() : '';
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || current.isContentEditable === true || current.contentEditable === 'true') return true;
    current = current.parentElement;
  }
  return false;
}

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

export function pointToRectDistance(point: Point, node: GeometryNode): number {
  const dx = Math.max(node.positionX - point.x, 0, point.x - (node.positionX + node.width));
  const dy = Math.max(node.positionY - point.y, 0, point.y - (node.positionY + node.height));
  return Math.hypot(dx, dy);
}

export function findConnectionTarget<T extends GeometryNode & { id: string }>(nodes: T[], sourceId: string, pointerWorld: Point, margin = CONNECTION_SNAP_MARGIN): T | null {
  return nodes.filter(node => node.id !== sourceId && pointToRectDistance(pointerWorld, node) <= margin)
    .sort((a, b) => pointToRectDistance(pointerWorld, a) - pointToRectDistance(pointerWorld, b) || a.id.localeCompare(b.id))[0] ?? null;
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

const anchors: EdgeAnchor[] = ['top', 'right', 'bottom', 'left'];
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (p: Point, amount: number): Point => ({ x: p.x * amount, y: p.y * amount });
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export function expandedBounds(node: GeometryNode, clearance = EDGE_CLEARANCE): Rect {
  return { minX: node.positionX - clearance, minY: node.positionY - clearance, maxX: node.positionX + node.width + clearance, maxY: node.positionY + node.height + clearance };
}

function pointInRect(point: Point, rect: Rect): boolean {
  return point.x > rect.minX && point.x < rect.maxX && point.y > rect.minY && point.y < rect.maxY;
}

function orientation(a: Point, b: Point, c: Point): number { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(a: Point, b: Point, c: Point): boolean { return Math.min(a.x, c.x) - 0.001 <= b.x && b.x <= Math.max(a.x, c.x) + 0.001 && Math.min(a.y, c.y) - 0.001 <= b.y && b.y <= Math.max(a.y, c.y) + 0.001; }
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c); const o2 = orientation(a, b, d); const o3 = orientation(c, d, a); const o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return (Math.abs(o1) < 0.001 && onSegment(a, c, b)) || (Math.abs(o2) < 0.001 && onSegment(a, d, b)) || (Math.abs(o3) < 0.001 && onSegment(c, a, d)) || (Math.abs(o4) < 0.001 && onSegment(c, b, d));
}

export function segmentIntersectsRect(start: Point, end: Point, rect: Rect): boolean {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true;
  const topLeft = { x: rect.minX, y: rect.minY }; const topRight = { x: rect.maxX, y: rect.minY };
  const bottomRight = { x: rect.maxX, y: rect.maxY }; const bottomLeft = { x: rect.minX, y: rect.maxY };
  return segmentsIntersect(start, end, topLeft, topRight) || segmentsIntersect(start, end, topRight, bottomRight) || segmentsIntersect(start, end, bottomRight, bottomLeft) || segmentsIntersect(start, end, bottomLeft, topLeft);
}

export function routeIntersectsObstacle(points: Point[], obstacle: GeometryNode | Rect, clearance = EDGE_CLEARANCE): boolean {
  const rect = 'positionX' in obstacle ? expandedBounds(obstacle, clearance) : obstacle;
  return points.some(point => pointInRect(point, rect)) || points.slice(1).some((point, index) => segmentIntersectsRect(points[index], point, rect));
}

export function candidateRouteClear(points: Point[], obstacles: GeometryNode[], clearance = EDGE_CLEARANCE): boolean {
  return obstacles.every(obstacle => !routeIntersectsObstacle(points, obstacle, clearance));
}

function exitPoint(node: GeometryNode, anchor: EdgeAnchor, amount = EDGE_EXIT_DISTANCE): Point { return add(anchorPoint(node, anchor), scale(anchorDirection(anchor), amount)); }
function rectCorners(rect: Rect): Point[] { return [{ x: rect.minX - 1, y: rect.minY - 1 }, { x: rect.maxX + 1, y: rect.minY - 1 }, { x: rect.maxX + 1, y: rect.maxY + 1 }, { x: rect.minX - 1, y: rect.maxY + 1 }]; }
function pathLength(points: Point[]): number { return points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0); }

function visibleRoute(start: Point, end: Point, obstacles: GeometryNode[], clearance: number): Point[] | null {
  if (candidateRouteClear([start, end], obstacles, clearance)) return [start, end];
  const expanded = obstacles.map(node => expandedBounds(node, clearance));
  const graph = [start, end, ...expanded.flatMap(rectCorners)];
  const distances = graph.map((_, index) => index === 0 ? 0 : Number.POSITIVE_INFINITY); const previous: Array<number | null> = graph.map(() => null); const visited = new Set<number>();
  while (visited.size < graph.length) {
    let current = -1; let best = Number.POSITIVE_INFINITY;
    distances.forEach((value, index) => { if (!visited.has(index) && value < best) { best = value; current = index; } });
    if (current < 0) break;
    visited.add(current);
    if (current === 1) break;
    for (let next = 0; next < graph.length; next += 1) {
      if (visited.has(next) || next === current) continue;
      const segment = [graph[current], graph[next]];
      if (!candidateRouteClear(segment, obstacles, clearance)) continue;
      const bendPenalty = previous[current] === null ? 0 : 42;
      const nextDistance = distances[current] + distance(graph[current], graph[next]) + bendPenalty;
      if (nextDistance < distances[next]) { distances[next] = nextDistance; previous[next] = current; }
    }
  }
  if (!Number.isFinite(distances[1])) return null;
  const result: Point[] = []; for (let cursor: number | null = 1; cursor !== null; cursor = previous[cursor]) result.unshift(graph[cursor]);
  return candidateRouteClear(result, obstacles, clearance) ? result : null;
}

function roundPath(points: Point[], radius = 28): { path: string; midpoint: Point } {
  if (points.length < 2) return { path: '', midpoint: points[0] ?? { x: 0, y: 0 } };
  if (points.length === 2) { const midpoint = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }; return { path: `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`, midpoint }; }
  let path = `M ${points[0].x} ${points[0].y}`;
  const samples: Array<{ point: Point; length: number }> = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1]; const corner = points[index]; const after = points[index + 1];
    const r = Math.min(radius, distance(before, corner) / 2, distance(corner, after) / 2);
    const incoming = add(corner, scale({ x: before.x - corner.x, y: before.y - corner.y }, r / distance(before, corner)));
    const outgoing = add(corner, scale({ x: after.x - corner.x, y: after.y - corner.y }, r / distance(corner, after)));
    path += ` L ${incoming.x} ${incoming.y} Q ${corner.x} ${corner.y} ${outgoing.x} ${outgoing.y}`;
    samples.push({ point: corner, length: distance(before, after) });
  }
  path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  const midpoint = samples.sort((a, b) => b.length - a.length)[0]?.point ?? points[Math.floor(points.length / 2)];
  return { path, midpoint };
}

function routeCost(points: Point[]): number { return pathLength(points) + Math.max(0, points.length - 2) * 42; }

export function routeEdge(source: GeometryNode, target: GeometryNode, obstacles: GeometryNode[] = [], offset = 0, clearance = EDGE_CLEARANCE, preferred?: { sourceAnchor: EdgeAnchor; targetAnchor: EdgeAnchor }): EdgeRoute {
  const usableObstacles = obstacles.filter(node => node !== source && node !== target);
  const corridor = { minX: Math.min(source.positionX, target.positionX) - 220, minY: Math.min(source.positionY, target.positionY) - 220, maxX: Math.max(source.positionX + source.width, target.positionX + target.width) + 220, maxY: Math.max(source.positionY + source.height, target.positionY + target.height) + 220 };
  const relevantObstacles = usableObstacles.filter(node => { const rect = expandedBounds(node, clearance); return rect.maxX >= corridor.minX && rect.minX <= corridor.maxX && rect.maxY >= corridor.minY && rect.minY <= corridor.maxY; });
  const candidates: Array<{ points: Point[]; sourceAnchor: EdgeAnchor; targetAnchor: EdgeAnchor; cost: number }> = [];
  const anchorPairs = relevantObstacles.length ? anchors.flatMap(sourceAnchor => anchors.map(targetAnchor => ({ sourceAnchor, targetAnchor }))) : [chooseEdgeAnchors(source, target)];
  for (const { sourceAnchor, targetAnchor } of anchorPairs) {
    const start = anchorPoint(source, sourceAnchor); const end = anchorPoint(target, targetAnchor);
    const points = visibleRoute(exitPoint(source, sourceAnchor), exitPoint(target, targetAnchor), relevantObstacles, clearance);
    if (!points) continue;
    const complete = [start, ...points, end];
    if (!candidateRouteClear(complete.slice(1, -1), relevantObstacles, clearance)) continue;
    const directionalPenalty = (anchorDirection(sourceAnchor).x * (end.x - start.x) + anchorDirection(sourceAnchor).y * (end.y - start.y) < 0 ? 120 : 0) + (anchorDirection(targetAnchor).x * (start.x - end.x) + anchorDirection(targetAnchor).y * (start.y - end.y) < 0 ? 120 : 0);
    const stabilityPenalty = preferred && (preferred.sourceAnchor !== sourceAnchor || preferred.targetAnchor !== targetAnchor) ? 36 : 0;
    candidates.push({ points: complete, sourceAnchor, targetAnchor, cost: routeCost(complete) + directionalPenalty + stabilityPenalty });
  }
  const fallbackAnchors = chooseEdgeAnchors(source, target); const fallback = [anchorPoint(source, fallbackAnchors.sourceAnchor), anchorPoint(target, fallbackAnchors.targetAnchor)];
  const chosen = candidates.sort((a, b) => a.cost - b.cost || a.sourceAnchor.localeCompare(b.sourceAnchor) || a.targetAnchor.localeCompare(b.targetAnchor))[0] ?? { points: fallback, ...fallbackAnchors, cost: routeCost(fallback) };
  const routed = chosen.points.length > 4;
  const laneNormal = { x: -(chosen.points[chosen.points.length - 1].y - chosen.points[0].y), y: chosen.points[chosen.points.length - 1].x - chosen.points[0].x };
  const laneLength = Math.hypot(laneNormal.x, laneNormal.y) || 1;
  const displayPoints = !routed && offset ? chosen.points.map((point, index) => index === 0 || index === chosen.points.length - 1 ? point : { x: point.x + laneNormal.x / laneLength * offset, y: point.y + laneNormal.y / laneLength * offset }) : chosen.points;
  const rounded = roundPath(displayPoints);
  const start = displayPoints[0]; const end = displayPoints[displayPoints.length - 1];
  const sourceDirection = anchorDirection(chosen.sourceAnchor); const targetDirection = anchorDirection(chosen.targetAnchor);
  const controlDistance = Math.max(EDGE_EXIT_DISTANCE, Math.min(180, distance(start, end) * 0.35));
  const control1 = add(start, scale(sourceDirection, controlDistance)); const control2 = add(end, scale(targetDirection, controlDistance));
  return { start, control1, control2, end, midpoint: rounded.midpoint, labelPoint: rounded.midpoint, sourceAnchor: chosen.sourceAnchor, targetAnchor: chosen.targetAnchor, points: displayPoints, path: rounded.path, length: pathLength(displayPoints), bends: Math.max(0, displayPoints.length - 2), routed };
}

const routeMemory = new Map<string, { sourceAnchor: EdgeAnchor; targetAnchor: EdgeAnchor }>();
export function routeEdgeStable(key: string, source: GeometryNode, target: GeometryNode, obstacles: GeometryNode[] = [], offset = 0, clearance = EDGE_CLEARANCE): EdgeRoute {
  const route = routeEdge(source, target, obstacles, offset, clearance, routeMemory.get(key));
  routeMemory.set(key, { sourceAnchor: route.sourceAnchor, targetAnchor: route.targetAnchor });
  return route;
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

export function connectionPreviewCurve(source: GeometryNode, pointer: Point): EdgeCurve {
  const target = { positionX: pointer.x - 0.5, positionY: pointer.y - 0.5, width: 1, height: 1 };
  const { sourceAnchor } = chooseEdgeAnchors(source, target);
  const start = anchorPoint(source, sourceAnchor);
  const distance = Math.min(180, Math.max(48, Math.hypot(pointer.x - start.x, pointer.y - start.y) * 0.35));
  const direction = anchorDirection(sourceAnchor);
  const control1 = { x: start.x + direction.x * distance, y: start.y + direction.y * distance };
  const control2 = { x: pointer.x - direction.x * distance * 0.65, y: pointer.y - direction.y * distance * 0.65 };
  return { start, control1, control2, end: pointer, midpoint: cubicBezierPoint(start, control1, control2, pointer, 0.5), sourceAnchor, targetAnchor: sourceAnchor };
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
