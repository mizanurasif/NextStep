import { View, Text, Pressable, Platform } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import dayjs from 'dayjs'
import { colors } from '@/constants/theme'

type Props = {
  value: Date
  onChange: (date: Date) => void
  label: string
  withTime?: boolean
}

// iOS shows the native compact picker inline; Android opens the system date and time dialogs
const DateTimeField = ({ value, onChange, label, withTime = true }: Props) => {
  if (Platform.OS === 'ios') {
    return (
      <View className="date-field-ios">
        <DateTimePicker
          value={value}
          mode={withTime ? 'datetime' : 'date'}
          display="compact"
          accentColor={colors.accent}
          themeVariant="light"
          onChange={(_, date) => date && onChange(date)}
          accessibilityLabel={label}
        />
      </View>
    )
  }

  const openDate = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return
        // Keep the chosen time when only the day changes
        onChange(dayjs(value).year(date.getFullYear()).month(date.getMonth()).date(date.getDate()).toDate())
      },
    })

  const openTime = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'time',
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return
        onChange(dayjs(value).hour(date.getHours()).minute(date.getMinutes()).toDate())
      },
    })

  return (
    <View className="flex-row gap-2.5">
      <Pressable className="date-field flex-1" onPress={openDate} accessibilityRole="button" accessibilityLabel={`${label} date`}>
        <Text className="date-field-text">{dayjs(value).format('ddd, MMM D, YYYY')}</Text>
      </Pressable>
      {withTime && (
        <Pressable className="date-field w-30" onPress={openTime} accessibilityRole="button" accessibilityLabel={`${label} time`}>
          <Text className="date-field-text">{dayjs(value).format('h:mm A')}</Text>
        </Pressable>
      )}
    </View>
  )
}

export default DateTimeField
