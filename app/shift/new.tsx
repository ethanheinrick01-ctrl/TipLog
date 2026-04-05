import { useLocalSearchParams } from 'expo-router';
import { ShiftForm } from '../../components/ShiftForm';
import { useShiftStore } from '../../store/shiftStore';
import { Shift } from '../../lib/types';

export default function NewShiftScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { pendingShift, setPendingShift, jobs } = useShiftStore();

  // Read pendingShift synchronously so ShiftForm gets the data on its very
  // first render — useState initializers only run once at mount, so passing
  // the data via an effect-driven state update arrives too late.
  let initialData: Partial<Shift> | undefined;
  if (pendingShift) {
    initialData = {
      ...pendingShift,
      jobId: pendingShift.jobId || jobs[0]?.id || '',
    };
    // Clear immediately so it doesn't persist across navigations
    setPendingShift(null);
  }

  return <ShiftForm initialDate={date} existing={initialData as Shift | undefined} />;
}
