/**
 * Resizes a base64 data URL image so the longer side is at most maxSide pixels.
 * Uses browser-native canvas. Returns the original if already within bounds.
 */
export async function resizeImage(base64DataUrl, maxSide = 1024) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const { naturalWidth: w, naturalHeight: h } = img;

            if (w <= maxSide && h <= maxSide) {
                return resolve(base64DataUrl);
            }

            const scale = maxSide / Math.max(w, h);
            const newW = Math.round(w * scale);
            const newH = Math.round(h * scale);

            const canvas = document.createElement('canvas');
            canvas.width = newW;
            canvas.height = newH;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, newW, newH);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load image for resizing'));
        img.src = base64DataUrl;
    });
}
