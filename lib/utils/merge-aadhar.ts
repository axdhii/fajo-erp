import { supabase } from '@/lib/supabase/client'

/**
 * Result of an Aadhar lookup for a single phone number.
 * If a previous guest record with Aadhar photos is found, the storage
 * paths are returned so the CRE can reuse them without re-uploading.
 *
 * `stitched` is true when front === back, meaning a single combined
 * (front+back stitched) image was uploaded instead of two separate files.
 */
export interface AadharMatch {
    name: string
    phone: string
    aadhar_url_front: string
    aadhar_url_back: string
    stitched: boolean
}

/**
 * Looks up the most recent guest record that has Aadhar photos on file
 * for the given phone number. Returns null if no match is found.
 *
 * The query finds guests whose phone matches AND who have at least
 * aadhar_url_front stored, ordered by most recent first. Handles both
 * legacy (separate front/back) and stitched (single combined) uploads.
 */
export async function lookupAadhar(phone: string): Promise<AadharMatch | null> {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) return null

    const { data, error } = await supabase
        .from('guests')
        .select('name, phone, aadhar_url_front, aadhar_url_back')
        .eq('phone', digits)
        .not('aadhar_url_front', 'is', null)
        .neq('aadhar_url_front', '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error || !data || !data.aadhar_url_front) return null

    // If back is missing or empty, not a valid match (legacy incomplete upload)
    if (!data.aadhar_url_back) return null

    // Detect stitched images: front and back point to the same file
    const isStitched = data.aadhar_url_front === data.aadhar_url_back

    return {
        name: data.name,
        phone: data.phone,
        aadhar_url_front: data.aadhar_url_front,
        aadhar_url_back: data.aadhar_url_back,
        stitched: isStitched,
    }
}

/**
 * Generates a Supabase public URL for an Aadhar storage path.
 * Used to show a preview thumbnail of previously uploaded Aadhar photos.
 */
export function getAadharPublicUrl(storagePath: string): string {
    const { data } = supabase.storage.from('aadhars').getPublicUrl(storagePath)
    return data.publicUrl
}
