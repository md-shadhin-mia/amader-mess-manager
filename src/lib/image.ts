/** Image processing helpers for resizing avatars to 128x128 before upload. */

export interface CropDimensions {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  dx: number;
  dy: number;
  dWidth: number;
  dHeight: number;
}

/**
 * Calculates center-crop source rectangle coordinates to fit target dimensions with object-fit: cover.
 * Pure function so it can be tested in any JavaScript runtime.
 */
export function calculateCropDimensions(
  srcWidth: number,
  srcHeight: number,
  targetWidth = 128,
  targetHeight = 128,
): CropDimensions {
  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new Error(`Invalid source dimensions: ${srcWidth}x${srcHeight}`);
  }

  const srcAspect = srcWidth / srcHeight;
  const targetAspect = targetWidth / targetHeight;

  let sWidth: number;
  let sHeight: number;
  let sx: number;
  let sy: number;

  if (srcAspect > targetAspect) {
    // Source is wider than target: fit height, crop width evenly from sides
    sHeight = srcHeight;
    sWidth = srcHeight * targetAspect;
    sx = Math.round((srcWidth - sWidth) / 2);
    sy = 0;
  } else {
    // Source is taller than or equal to target: fit width, crop height evenly from top/bottom
    sWidth = srcWidth;
    sHeight = srcWidth / targetAspect;
    sx = 0;
    sy = Math.round((srcHeight - sHeight) / 2);
  }

  return {
    sx,
    sy,
    sWidth: Math.round(sWidth),
    sHeight: Math.round(sHeight),
    dx: 0,
    dy: 0,
    dWidth: targetWidth,
    dHeight: targetHeight,
  };
}

/**
 * Resizes and center-crops an image file to 128x128 pixels in the browser before upload.
 * Returns both a base64 data URL and a Blob for flexible storage.
 */
export async function convertImageTo128x128(
  file: File | Blob,
  targetSize = 128,
): Promise<{ dataUrl: string; blob: Blob }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('convertImageTo128x128 must be executed in a browser environment');
  }

  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Selected file is not an image');
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const crop = calculateCropDimensions(img.naturalWidth, img.naturalHeight, targetSize, targetSize);
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get 2D canvas context'));
          return;
        }

        // Enable high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
          img,
          crop.sx,
          crop.sy,
          crop.sWidth,
          crop.sHeight,
          crop.dx,
          crop.dy,
          crop.dWidth,
          crop.dHeight,
        );

        // Export as JPEG with 0.85 quality (~4-8 KB for 128x128)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ dataUrl, blob });
            } else {
              // Fallback to creating blob from dataUrl
              const binary = atob(dataUrl.split(',')[1]);
              const array = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
              }
              const fallbackBlob = new Blob([array], { type: 'image/jpeg' });
              resolve({ dataUrl, blob: fallbackBlob });
            }
          },
          'image/jpeg',
          0.85,
        );
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for resizing'));
    };

    img.src = objectUrl;
  });
}
