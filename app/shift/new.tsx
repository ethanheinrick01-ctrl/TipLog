import { useLocalSearchParams } from 'expo-router';
import { ShiftForm } from '../../components/ShiftForm';

export default function NewShiftScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <ShiftForm initialDate={date} />;
}
