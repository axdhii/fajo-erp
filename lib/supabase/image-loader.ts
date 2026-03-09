import { ImageLoaderProps } from 'next/image'

const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1].split('.')[0] || ''

export default function supabaseLoader({ src, width, quality }: ImageLoaderProps) {
    // src here should be the storage file path e.g "aadhars/123-random.jpg"
    // But wait! If src is a full public URL, we parse it:
    if (src.includes('storage/v1/object/public/')) {
        const parts = src.split('storage/v1/object/public/')
        const path = parts[1] // e.g. "aadhars/filename.jpg"
        // Transform URL: storage/v1/render/image/public/BUCKET/FILE?width=X&format=webp&quality=Y
        return `https://${projectId}.supabase.co/storage/v1/render/image/public/${path}?width=${width}&quality=${quality || 75}&format=webp`
    }

    // Fallback for normal URLs
    return src
}
