import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { anchorPoint, boundingBox, candidateRouteClear, chooseEdgeAnchors, clampZoom, connectionPreviewCurve, constrainNodeSize, cubicBezierPoint, dragDelta, edgeCurve, edgeEndpoints, expandedBounds, findConnectionTarget, fitView, intersectsRect, isEditableTarget, normalizeViewport, panViewport, pointToRectDistance, rectFromPoints, routeEdge, routeIntersectsObstacle, screenToWorld, segmentIntersectsRect, worldToScreen, zoomAroundPoint } from '../web/src/canvasGeometry';

describe('canvas geometry', () => {
  it('converts screen and world coordinates in both directions', () => {
    const view = { x: 40, y: 20, zoom: 2 };
    expect(screenToWorld({ x: 140, y: 80 }, view)).toEqual({ x: 50, y: 30 });
    expect(worldToScreen({ x: 50, y: 30 }, view)).toEqual({ x: 140, y: 80 });
  });

  it.each([0.5, 1, 2])('maps world coordinates at zoom %s', (zoom) => {
    const view = { x: 40, y: 20, zoom };
    const world = { x: 120, y: 80 };
    expect(worldToScreen(world, view)).toEqual({ x: 40 + world.x * zoom, y: 20 + world.y * zoom });
    expect(screenToWorld(worldToScreen(world, view), view)).toEqual(world);
  });

  it('keeps node dimensions in world units while the viewport changes', () => {
    const node = { positionX: 10, positionY: 20, width: 320, height: 180 };
    const original = { ...node };
    for (const zoom of [0.5, 1, 2]) {
      const topLeft = worldToScreen({ x: node.positionX, y: node.positionY }, { x: 0, y: 0, zoom });
      const bottomRight = worldToScreen({ x: node.positionX + node.width, y: node.positionY + node.height }, { x: 0, y: 0, zoom });
      expect(bottomRight.x - topLeft.x).toBe(node.width * zoom);
      expect(bottomRight.y - topLeft.y).toBe(node.height * zoom);
      expect(node).toEqual(original);
    }
  });

  it('keeps node content inside the shared world transform', () => {
    const source = readFileSync(new URL('../web/src/main.tsx', import.meta.url), 'utf8');
    expect(source).toContain('className="world"');
    expect(source).toContain("translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.zoom + ')");
    expect(source).not.toContain('node.width * zoom');
    expect(source).not.toContain('node.height * zoom');
    expect(source).not.toContain('fontSize =');
  });

  it('converts drag deltas according to zoom', () => {
    expect(dragDelta({ x: 100, y: -50 }, 2)).toEqual({ x: 50, y: -25 });
  });

  it('keeps canvas pan in screen pixels at every zoom', () => {
    expect(panViewport({ x: 10, y: 20, zoom: 0.5 }, { x: 100, y: -40 })).toEqual({ x: 110, y: -20, zoom: 0.5 });
    expect(panViewport({ x: 10, y: 20, zoom: 2 }, { x: 100, y: -40 })).toEqual({ x: 110, y: -20, zoom: 2 });
  });

  it('keeps the cursor world point stable while zooming', () => {
    const before = { x: 100, y: 80 };
    const next = zoomAroundPoint({ x: 20, y: 10, zoom: 1 }, before, 2);
    expect(worldToScreen(screenToWorld(before, { x: 20, y: 10, zoom: 1 }), next)).toEqual(before);
  });

  it('clamps zoom and normalizes invalid viewport values', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(4)).toBe(2.5);
    expect(normalizeViewport({ x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: Number.NaN })).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('applies minimum and maximum node dimensions', () => {
    expect(constrainNodeSize(20, 50)).toEqual({ width: 160, height: 100 });
    expect(constrainNodeSize(2000, 2000)).toEqual({ width: 1200, height: 1000 });
  });

  it('calculates a bounding box', () => {
    expect(boundingBox([{ positionX: 20, positionY: 30, width: 100, height: 80 }, { positionX: -10, positionY: 50, width: 40, height: 20 }])).toEqual({ minX: -10, minY: 30, maxX: 120, maxY: 110 });
  });

  it('fits content inside the canvas with padding', () => {
    const view = fitView([{ positionX: 0, positionY: 0, width: 200, height: 100 }], { width: 600, height: 400 }, 50);
    expect(view.zoom).toBe(2.5);
    expect(view.x).toBe(50);
    expect(view.y).toBe(75);
  });

  it('returns the initial viewport when there are no nodes', () => {
    expect(fitView([], { width: 600, height: 400 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('selects nodes intersecting a world-space marquee', () => {
    const bounds = rectFromPoints({ x: 90, y: 90 }, { x: 250, y: 210 });
    expect(intersectsRect({ positionX: 100, positionY: 100, width: 80, height: 80 }, bounds)).toBe(true);
    expect(intersectsRect({ positionX: 300, positionY: 100, width: 80, height: 80 }, bounds)).toBe(false);
  });

  it('chooses horizontal and vertical anchors from node centers', () => {
    const node = { positionX: 0, positionY: 0, width: 100, height: 80 };
    expect(chooseEdgeAnchors(node, { positionX: 200, positionY: 10, width: 100, height: 80 })).toEqual({ sourceAnchor: 'right', targetAnchor: 'left' });
    expect(chooseEdgeAnchors({ ...node, positionX: 300 }, node)).toEqual({ sourceAnchor: 'left', targetAnchor: 'right' });
    expect(chooseEdgeAnchors(node, { positionX: 20, positionY: 180, width: 100, height: 80 })).toEqual({ sourceAnchor: 'bottom', targetAnchor: 'top' });
    expect(chooseEdgeAnchors({ ...node, positionY: 220 }, node)).toEqual({ sourceAnchor: 'top', targetAnchor: 'bottom' });
  });

  it('recalculates endpoints and controls as nodes cross positions', () => {
    const source = { positionX: 0, positionY: 0, width: 100, height: 80 };
    const target = { positionX: 200, positionY: 0, width: 100, height: 80 };
    const curve = edgeCurve(source, target);
    expect(curve.start).toEqual(anchorPoint(source, 'right'));
    expect(curve.end).toEqual(anchorPoint(target, 'left'));
    expect(curve.control1.x).toBeGreaterThan(curve.start.x);
    const crossed = edgeCurve({ ...source, positionX: 300 }, target);
    expect(crossed.sourceAnchor).toBe('left');
    expect(crossed.targetAnchor).toBe('right');
  });

  it('calculates cubic midpoint and keeps legacy endpoint access', () => {
    const start = { x: 0, y: 0 }; const control1 = { x: 10, y: 0 }; const control2 = { x: 10, y: 10 }; const end = { x: 0, y: 10 };
    expect(cubicBezierPoint(start, control1, control2, end, 0.5)).toEqual({ x: 7.5, y: 5 });
    expect(edgeEndpoints({ positionX: 0, positionY: 0, width: 100, height: 80 }, { positionX: 200, positionY: 10, width: 100, height: 80 }).start.x).toBe(100);
  });

  it('finds magnetic targets in world space, excluding the source', () => {
    const nodes = [{ id: 'source', positionX: 0, positionY: 0, width: 100, height: 80 }, { id: 'near', positionX: 130, positionY: 0, width: 100, height: 80 }, { id: 'far', positionX: 180, positionY: 0, width: 100, height: 80 }];
    expect(findConnectionTarget(nodes, 'source', { x: 115, y: 40 }, 18)?.id).toBe('near');
    expect(findConnectionTarget(nodes, 'source', { x: 119, y: 40 }, 10)).toBeNull();
    expect(findConnectionTarget(nodes, 'source', { x: 40, y: 40 }, 18)).toBeNull();
    expect(pointToRectDistance({ x: 130, y: 40 }, nodes[1])).toBe(0);
  });

  it('uses deterministic nearest-candidate selection and preserves preview curves', () => {
    const nodes = [{ id: 'b', positionX: 100, positionY: 0, width: 100, height: 80 }, { id: 'a', positionX: 100, positionY: 100, width: 100, height: 80 }];
    expect(findConnectionTarget(nodes, 'source', { x: 100, y: 90 }, 20)?.id).toBe('a');
    const preview = connectionPreviewCurve({ positionX: 0, positionY: 0, width: 100, height: 80 }, { x: 180, y: 40 });
    expect(preview.end).toEqual({ x: 180, y: 40 });
    expect(preview.control1).not.toEqual(preview.start);
  });

  it('converts magnetic pointer coordinates under zoom and pan', () => {
    const view = { x: 40, y: 20, zoom: 0.5 };
    const world = screenToWorld({ x: 115, y: 60 }, view);
    expect(findConnectionTarget([{ id: 'target', positionX: 130, positionY: 60, width: 100, height: 80 }], 'source', world, 18)?.id).toBe('target');
  });

  it('ignores delete keys for all textual editing targets', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
  });

  it('routes directly when the corridor is clear and keeps source/target out of obstacles', () => {
    const source = { positionX: 0, positionY: 100, width: 100, height: 80 };
    const target = { positionX: 500, positionY: 100, width: 100, height: 80 };
    const route = routeEdge(source, target, [source, target]);
    expect(route.routed).toBe(false);
    expect(route.sourceAnchor).toBe('right');
    expect(route.targetAnchor).toBe('left');
    expect(route.path).toContain('Q');
  });

  it('routes above or below an obstacle and preserves expanded clearance', () => {
    const source = { positionX: 0, positionY: 100, width: 100, height: 80 };
    const target = { positionX: 500, positionY: 100, width: 100, height: 80 };
    const obstacle = { positionX: 250, positionY: 80, width: 100, height: 120 };
    const route = routeEdge(source, target, [obstacle]);
    expect(route.routed).toBe(true);
    expect(route.points.length).toBeGreaterThan(4);
    expect(candidateRouteClear(route.points, [obstacle])).toBe(true);
    expect(routeIntersectsObstacle(route.points, obstacle)).toBe(false);
    expect(route.path).toContain('Q');
    expect(route.labelPoint.x).toBeGreaterThan(0);
    expect(route.labelPoint.x).toBeLessThan(600);
  });

  it('chooses the shorter side, supports multiple obstacles, and returns to direct routing when moved away', () => {
    const source = { positionX: 0, positionY: 200, width: 100, height: 80 };
    const target = { positionX: 700, positionY: 200, width: 100, height: 80 };
    const shortTop = { positionX: 300, positionY: 240, width: 100, height: 80 };
    const route = routeEdge(source, target, [shortTop]);
    expect(route.routed).toBe(true);
    expect(Math.min(...route.points.map(point => point.y))).toBeLessThan(220);
    const two = routeEdge(source, target, [shortTop, { positionX: 470, positionY: 240, width: 100, height: 80 }]);
    expect(two.routed).toBe(true);
    expect(two.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(routeEdge(source, target, [{ positionX: 300, positionY: 500, width: 100, height: 80 }]).routed).toBe(false);
  });

  it('exposes pure rectangle and segment clearance helpers', () => {
    const node = { positionX: 100, positionY: 100, width: 80, height: 60 };
    expect(expandedBounds(node, 20)).toEqual({ minX: 80, minY: 80, maxX: 200, maxY: 180 });
    expect(segmentIntersectsRect({ x: 0, y: 130 }, { x: 300, y: 130 }, expandedBounds(node, 20))).toBe(true);
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 300, y: 0 }, expandedBounds(node, 20))).toBe(false);
  });

  it('keeps routing geometry independent from viewport zoom', () => {
    const source = { positionX: 0, positionY: 100, width: 100, height: 80 };
    const target = { positionX: 500, positionY: 100, width: 100, height: 80 };
    const obstacle = { positionX: 250, positionY: 80, width: 100, height: 120 };
    const base = routeEdge(source, target, [obstacle]);
    for (const zoom of [0.5, 1, 2]) expect(routeEdge(source, target, [obstacle])).toEqual(base);
    expect(worldToScreen(base.labelPoint, { x: 40, y: 20, zoom: 2 })).not.toEqual(base.labelPoint);
  });

  it('is deterministic and finite for a stress graph with many nodes and edges', () => {
    const nodes = Array.from({ length: 20 }, (_, index) => ({ positionX: (index % 5) * 260, positionY: Math.floor(index / 5) * 220, width: 160, height: 100 }));
    const routes = nodes.flatMap((source, index) => nodes.slice(index + 1, index + 4).map(target => routeEdge(source, target, nodes.filter(node => node !== source && node !== target))));
    expect(routes).toHaveLength(54);
    expect(routes.every(route => route.points.length > 1 && route.path.length > 0 && route.points.flatMap(point => [point.x, point.y]).every(Number.isFinite))).toBe(true);
    const repeat = nodes.slice(0, 4).flatMap((source, index) => nodes.slice(index + 1, index + 4).map(target => routeEdge(source, target, nodes.filter(node => node !== source && node !== target)).path));
    expect(routes.slice(0, repeat.length).map(route => route.path)).toEqual(repeat);
  });
});
