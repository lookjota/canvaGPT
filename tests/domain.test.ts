import { describe, expect, it } from 'vitest';
import { anchorPoint, boundingBox, chooseEdgeAnchors, clampZoom, connectionPreviewCurve, constrainNodeSize, cubicBezierPoint, dragDelta, edgeCurve, edgeEndpoints, findConnectionTarget, fitView, intersectsRect, isEditableTarget, normalizeViewport, panViewport, pointToRectDistance, rectFromPoints, screenToWorld, worldToScreen, zoomAroundPoint } from '../web/src/canvasGeometry';

describe('canvas geometry', () => {
  it('converts screen and world coordinates in both directions', () => {
    const view = { x: 40, y: 20, zoom: 2 };
    expect(screenToWorld({ x: 140, y: 80 }, view)).toEqual({ x: 50, y: 30 });
    expect(worldToScreen({ x: 50, y: 30 }, view)).toEqual({ x: 140, y: 80 });
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
});
