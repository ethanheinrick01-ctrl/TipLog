/**
 * receiptImport.ts
 *
 * Unified receipt import adapters.
 * SupabaseOcrAdapter calls the live GPT-4o edge function via direct REST fetch.
 * MockOcrAdapter returns fixture data for development.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToastReceiptData {
  date?: string;
  clockIn?: string;
  clockOut?: string;
  tipsCredit?: number;
  tipsCash?: number;
  tipsWithheld?: number; // 3% employer tax
  sales?: number;
  covers?: number;
  tipOutByCategory?: Record<string, number>;
  rawText?: string;
  success: boolean;
  error?: string;
}

export interface OcrAdapter {
  recognizeImages(imageUris: string[]): Promise<ToastReceiptData>;
}

// ─── Supabase Edge Function adapter ─────────────────────────────────────────

export class SupabaseOcrAdapter implements OcrAdapter {
  /**
   * Sends all images to the GPT-4o edge function via direct REST fetch.
   * imageUris can be:
   * - base64 strings directly (preferred — from expo-image-picker with base64:true)
   * - file:// or content:// URIs (fetched and converted on native)
   *
   * Skips fetch entirely when already base64, avoiding web file:// CORS issues.
   */
  async recognizeImages(imageUris: string[]): Promise<ToastReceiptData> {
    const projectRef =
      process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('https://', '').replace('.supabase.co', '') ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const endpoint = `https://${projectRef}.supabase.co/functions/v1/ocr-receipt`;

    // Normalise: if already raw base64 (no URI scheme), pass through.
    // Otherwise resolve file:// / content:// via fetch on native.
    const base64Images = await Promise.all(
      imageUris.map(async (uri) => {
        // Preserve data: URIs so MIME type survives (screenshots are often PNG).
        if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('ph://')) {
          return uri.startsWith('data:') ? uri : `data:image/jpeg;base64,${uri}`;
        }

        // Native URI — fetch and convert to data URI
        const res = await fetch(uri);
        const blob = await res.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }),
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ images: base64Images }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 413) {
          return { success: false, error: 'Image too large. Use a tighter crop or lower-resolution screenshot and try again.' };
        }
        return { success: false, error: `HTTP ${response.status}: ${errText}` };
      }

      const data: ToastReceiptData = await response.json();
      return data;
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Network error' };
    }
  }
}

// ─── Mock adapter for development ──────────────────────────────────────────

export class MockOcrAdapter implements OcrAdapter {
  async recognizeImages(_imageUris: string[]): Promise<ToastReceiptData> {
    return {
      date: '2026-04-03',
      clockIn: '16:00',
      clockOut: '22:30',
      tipsCredit: 162.28,
      tipsCash: 52.74,
      tipsWithheld: 6.66,
      sales: 935.05,
      covers: 37,
      tipOutByCategory: {
        busser: 8.35,
        runner: 8.35,
        bar: 3.88,
        oyster: 3.67,
        expo: 0,
        host: 0,
        foodRunner: 0,
        support: 0,
        other: 0,
      },
      success: true,
    };
  }
}

// ─── Default export ─────────────────────────────────────────────────────────

/** Switch to MockOcrAdapter during local development to avoid API costs. */
export const defaultOcrAdapter: OcrAdapter = new SupabaseOcrAdapter();
