/**
 * Stitches two Aadhar images (front + back) into a single vertically
 * stacked image. The result is a compressed JPEG blob ready for upload.
 *
 * Layout:
 * ┌─────────────────┐
 * │   FRONT side    │
 * ├─────────────────┤
 * │   BACK  side    │
 * └─────────────────┘
 *
 * Both images are scaled to the same width (maxWidth) preserving their
 * aspect ratios, then drawn onto a single canvas one above the other.
 * A thin divider line separates the two halves for clarity.
 */

const MAX_WIDTH = 800
const JPEG_QUALITY = 0.65
const DIVIDER_HEIGHT = 2 // px — thin grey line between front/back

/**
 * Loads an image from a Blob/File and returns the HTMLImageElement once
 * it has been fully decoded.
 */
function loadImage(src: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = URL.createObjectURL(src)
    })
}

/**
 * Stitches front and back Aadhar photos into a single vertically stacked
 * JPEG image.  Returns a compressed Blob suitable for direct upload to
 * Supabase Storage.
 *
 * @param front - The front-side image (File or Blob)
 * @param back  - The back-side image  (File or Blob)
 * @returns A JPEG Blob containing both images stacked vertically
 */
export async function stitchAadhar(front: Blob, back: Blob): Promise<Blob> {
    const [imgFront, imgBack] = await Promise.all([
        loadImage(front),
        loadImage(back),
    ])

    // Scale both to MAX_WIDTH, preserving aspect ratio
    const scaleFront = Math.min(1, MAX_WIDTH / imgFront.width)
    const scaleBack = Math.min(1, MAX_WIDTH / imgBack.width)

    const wFront = Math.round(imgFront.width * scaleFront)
    const hFront = Math.round(imgFront.height * scaleFront)
    const wBack = Math.round(imgBack.width * scaleBack)
    const hBack = Math.round(imgBack.height * scaleBack)

    // Canvas width = widest of the two; height = sum + divider
    const canvasWidth = Math.max(wFront, wBack)
    const canvasHeight = hFront + DIVIDER_HEIGHT + hBack

    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context not available')

    // White background (in case images are narrower than canvas)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    // Draw front (centered horizontally)
    const xFront = Math.round((canvasWidth - wFront) / 2)
    ctx.drawImage(imgFront, xFront, 0, wFront, hFront)

    // Divider line
    ctx.fillStyle = '#cbd5e1' // slate-300
    ctx.fillRect(0, hFront, canvasWidth, DIVIDER_HEIGHT)

    // Draw back (centered horizontally)
    const xBack = Math.round((canvasWidth - wBack) / 2)
    ctx.drawImage(imgBack, xBack, hFront + DIVIDER_HEIGHT, wBack, hBack)

    // Revoke object URLs to prevent memory leaks
    URL.revokeObjectURL(imgFront.src)
    URL.revokeObjectURL(imgBack.src)

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) =>
                blob
                    ? resolve(blob)
                    : reject(new Error('Canvas toBlob failed')),
            'image/jpeg',
            JPEG_QUALITY,
        )
    })
}
