import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShiftForm } from '../../components/ShiftForm';
import { useShiftStore } from '../../store/shiftStore';
import { Shift } from '../../lib/types';

export default function NewShiftScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { pendingShift, setPendingShift, jobs } = useShiftStore();
  const [initialData, setInitialData] = useState<Partial<Shift> | undefined>();

  useEffect(() => {
    if (pendingShift) {
      // Merge pending OCR data with sensible defaults
      setInitialData({
        ...pendingShift,
        // Ensure job is set if only one exists
        jobId: pendingShift.jobId || jobs[0]?.id || '',
      });
      // Clear immediately so it doesn't persist across sessions
      setPendingShift(null);
    }
  }, [pendingShift]);

  return <ShiftForm initialDate={date} existing={initialData as Shift | undefined} />;
}
