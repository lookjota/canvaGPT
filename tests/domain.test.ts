import { describe, expect, it } from 'vitest';
import { boundingBox, clampZoom, constrainNodeSize, dragDelta, fitView, normalizeViewport, screenToWorld, worldToScreen, zoomAroundPoint } from '../web/src/canvasGeometry';

describe('canvas geometry', () => {
  it('converts screen and world coordinates in both directions', () => {
    const view = { x: 40, y: 20, zoom: 2 };
    expect(screenToWorld({ x: 140, y: 80 }, view)).toEqual({ x: 50, y: 30 });
    expect(worldToScreen({ x: 50, y: 30 }, view)).toEqual({ x: 140, y: 80 });
  });

  it('converts drag deltas according to zoom', () => {
    expect(dragDelta({ x: 100, y: -50 }, 2)).toEqual({ x: 50, y: -25 });
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
});
