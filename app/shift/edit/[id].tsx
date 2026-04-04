import { useLocalSearchParams } from 'expo-router';
import { View, Text } from 'react-native';
import { ShiftForm } from '../../../components/ShiftForm';
import { useShiftStore } from '../../../store/shiftStore';
import { Colors } from '../../../constants/theme';

export default function EditShiftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shift = useShiftStore((s) => s.shifts.find((sh) => sh.id === id));

  if (!shift) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
        <Text style={{ color: Colors.textSecondary }}>Shift not found.</Text>
      </View>
    );
  }

  return <ShiftForm existing={shift} />;
}
