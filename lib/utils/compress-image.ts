/**
 * Compresses an image file using canvas API.
 * Resizes to fit within maxWidth x maxHeight while preserving aspect ratio,
 * then outputs as JPEG at the given quality level.
 *
 * Designed for Aadhar photo uploads — keeps images well under the
 * 500KB Supabase bucket limit.
 */
export async function compressImage(
    file: File,
    maxWidth = 800,
    maxHeight = 600,
    quality = 0.6
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            let { width, height } = img

            // Scale down preserving aspect ratio
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height)
                width = Math.round(width * ratio)
                height = Math.round(height * ratio)
            }

            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) {
                reject(new Error('Canvas not supported'))
                return
            }
            ctx.drawImage(img, 0, 0, width, height)
            canvas.toBlob(
                (blob) =>
                    blob
                        ? resolve(blob)
                        : reject(new Error('Compression failed')),
                'image/jpeg',
                quality
            )
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = URL.createObjectURL(file)
    })
}
