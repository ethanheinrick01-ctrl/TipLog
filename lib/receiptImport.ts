/**
 * receiptImport.ts
 *
 * Unified receipt import adapters.
 * SupabaseOcrAdapter calls the live GPT-4o edge function.
 * MockOcrAdapter returns fixture data for development.
 */

import { supabase } from "./supabase";

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
   * Sends all images at once to the GPT-4o edge function.
   * imageUris can be local file:// URIs or http:// URIs.
   * Returns structured ToastReceiptData directly.
   */
  async recognizeImages(imageUris: string[]): Promise<ToastReceiptData> {
    // Fetch all images and convert to base64
    const base64Images = await Promise.all(
      imageUris.map(async (uri) => {
        const res = await fetch(uri);
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      })
    );

    const { data, error } = await supabase.functions.invoke<ToastReceiptData>(
      "ocr-receipt",
      { body: { images: base64Images } }
    );

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "No response from OCR function",
      };
    }

    return data;
  }
}

// ─── Mock adapter for development ──────────────────────────────────────────

export class MockOcrAdapter implements OcrAdapter {
  /**
   * Returns a realistic Friday-night fixture so you can develop
   * the import UI without hitting the live API.
   */
  async recognizeImages(_imageUris: string[]): Promise<ToastReceiptData> {
    // Simulate a Friday night shift at Mike Anderson's
    return {
      date: "2026-04-03",
      clockIn: "16:00",
      clockOut: "22:30",
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
