import { Text } from 'react-native'
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";

const SafeAreaView = styled(RNSafeAreaView);

// TODO: month view with deadline dots and the selected day's agenda
const Calendar = () => {
  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <Text className="list-title">Calendar</Text>
    </SafeAreaView>
  )
}

export default Calendar
