import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCropDimensions } from './image';

test('calculateCropDimensions handles square images without cropping', () => {
  const result = calculateCropDimensions(500, 500, 128, 128);
  assert.deepEqual(result, {
    sx: 0,
    sy: 0,
    sWidth: 500,
    sHeight: 500,
    dx: 0,
    dy: 0,
    dWidth: 128,
    dHeight: 128,
  });
});

test('calculateCropDimensions centers horizontally for wider landscape images', () => {
  // 800x400 source image: square crop will be 400x400, centered at x = (800 - 400) / 2 = 200
  const result = calculateCropDimensions(800, 400, 128, 128);
  assert.deepEqual(result, {
    sx: 200,
    sy: 0,
    sWidth: 400,
    sHeight: 400,
    dx: 0,
    dy: 0,
    dWidth: 128,
    dHeight: 128,
  });
});

test('calculateCropDimensions centers vertically for taller portrait images', () => {
  // 300x600 source image: square crop will be 300x300, centered at y = (600 - 300) / 2 = 150
  const result = calculateCropDimensions(300, 600, 128, 128);
  assert.deepEqual(result, {
    sx: 0,
    sy: 150,
    sWidth: 300,
    sHeight: 300,
    dx: 0,
    dy: 0,
    dWidth: 128,
    dHeight: 128,
  });
});

test('calculateCropDimensions throws on invalid dimensions', () => {
  assert.throws(() => calculateCropDimensions(0, 100));
  assert.throws(() => calculateCropDimensions(100, -50));
});
