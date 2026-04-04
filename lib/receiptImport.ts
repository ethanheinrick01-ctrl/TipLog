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
   * Sends all images at once to the GPT-4o edge function via direct REST fetch.
   * Avoids supabase.functions.invoke to prevent auth refresh loops on web.
   */
  async recognizeImages(imageUris: string[]): Promise<ToastReceiptData> {
    const projectRef = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('https://', '').replace('.supabase.co', '');
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const endpoint = `https://${projectRef}.supabase.co/functions/v1/ocr-receipt`;

    // Fetch all images and convert to base64
    const base64Images = await Promise.all(
      imageUris.map(async (uri) => {
        const res = await fetch(uri);
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      })
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
  /**
   * Returns a realistic Friday-night fixture so you can develop
   * the import UI without hitting the live API.
   */
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
