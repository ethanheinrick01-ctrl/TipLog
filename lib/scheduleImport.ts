/**
 * scheduleImport.ts
 *
 * HotSchedules schedule import adapters.
 * HotSchedulesOcrAdapter calls the live GPT-4o-mini edge function.
 * MockHotSchedulesOcrAdapter returns fixture data for development.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedShift {
  date: string;       // YYYY-MM-DD
  clockIn: string;    // HH:MM 24h
  clockOut: string;   // HH:MM 24h
  position: string;   // e.g. "Server", "Bartender"
}

export interface HotSchedulesData {
  employeeName?: string;
  weekOf?: string;    // YYYY-MM-DD of Monday
  shifts: ParsedShift[];
  success: boolean;
  error?: string;
}

export interface ScheduleAdapter {
  recognizeImages(imageUris: string[]): Promise<HotSchedulesData>;
}

// ─── Supabase Edge Function adapter ─────────────────────────────────────────

export class HotSchedulesOcrAdapter implements ScheduleAdapter {
  /**
   * Sends images to the parse-schedule edge function via direct REST fetch.
   * imageUris: base64 strings (from expo-image-picker with base64:true)
   */
  async recognizeImages(imageUris: string[]): Promise<HotSchedulesData> {
    const projectRef =
      process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('https://', '').replace('.supabase.co', '') ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const endpoint = `https://${projectRef}.supabase.co/functions/v1/parse-schedule`;

    // If already base64 strings, use directly; otherwise resolve URIs
    const base64Images = await Promise.all(
      imageUris.map(async (uri) => {
        if (
          !uri.startsWith('file://') &&
          !uri.startsWith('content://') &&
          !uri.startsWith('ph://')
        ) {
          // Strip data URI prefix if present (web sometimes returns data: URIs instead of raw base64)
          return uri.startsWith('data:') ? uri.split(',')[1] : uri;
        }
        const res = await fetch(uri);
        const blob = await res.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
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
        return { success: false, shifts: [], error: `HTTP ${response.status}: ${errText}` };
      }

      const data: HotSchedulesData = await response.json();
      return data;
    } catch (e: any) {
      return { success: false, shifts: [], error: e.message ?? 'Network error' };
    }
  }
}

// ─── Mock adapter ─────────────────────────────────────────────────────────────

export class MockHotSchedulesOcrAdapter implements ScheduleAdapter {
  async recognizeImages(_imageUris: string[]): Promise<HotSchedulesData> {
    return {
      employeeName: 'Ethan Heinrick',
      weekOf: '2026-04-06',
      shifts: [
        { date: '2026-04-06', clockIn: '16:00', clockOut: '22:00', position: 'Server' },
        { date: '2026-04-07', clockIn: '16:00', clockOut: '22:00', position: 'Server' },
        { date: '2026-04-08', clockIn: '11:00', clockOut: '17:00', position: 'Server' },
        { date: '2026-04-09', clockIn: '16:00', clockOut: '22:00', position: 'Server' },
        { date: '2026-04-10', clockIn: '11:00', clockOut: '19:00', position: 'Server' },
      ],
      success: true,
    };
  }
}

// ─── Default export ─────────────────────────────────────────────────────────

export const defaultScheduleAdapter: ScheduleAdapter = new HotSchedulesOcrAdapter();
