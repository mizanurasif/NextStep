import { useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";
import { useRouter } from 'expo-router'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { useApplications } from '@/lib/applications-store'
import { icons } from '@/constants/icons'
import { colors } from '@/constants/theme'
import { getCalendarEvents, getMonthGrid, groupEventsByDay } from '@/lib/applications'

const SafeAreaView = styled(RNSafeAreaView);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TYPE_COLORS: Record<ApplicationType, string> = {
  job: colors.jobStrong,
  university: colors.universityStrong,
  professor: colors.professorStrong,
}

const LEGEND: { type: ApplicationType; label: string }[] = [
  { type: 'job', label: 'Job' },
  { type: 'university', label: 'University' },
  { type: 'professor', label: 'Professor' },
]

const Calendar = () => {
  const router = useRouter()
  const { applications } = useApplications()
  const today = dayjs()
  const [month, setMonth] = useState(today.startOf('month'))
  const [selected, setSelected] = useState(today)

  const eventsByDay = groupEventsByDay(getCalendarEvents(applications))
  const agenda = eventsByDay[selected.format('YYYY-MM-DD')] ?? []
  const isSelectedToday = selected.isSame(today, 'day')

  const changeMonth = (step: number) => setMonth((current) => current.add(step, 'month'))

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pt-5 pb-30" showsVerticalScrollIndicator={false}>
        <View className="cal-header">
          <Text className="cal-month">{month.format('MMMM YYYY')}</Text>
          <View className="cal-nav">
            <Pressable className="detail-back" onPress={() => changeMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month">
              <Image source={icons.back} className="size-4.5" tintColor={colors.primary} />
            </Pressable>
            <Pressable className="detail-back" onPress={() => changeMonth(1)} accessibilityRole="button" accessibilityLabel="Next month">
              <Image source={icons.back} className="size-4.5" tintColor={colors.primary} style={{ transform: [{ rotate: '180deg' }] }} />
            </Pressable>
          </View>
        </View>

        <View className="cal-card">
          <View className="cal-weekdays">
            {WEEKDAYS.map((day) => (
              <Text key={day} className="cal-weekday">{day}</Text>
            ))}
          </View>
          <View className="cal-grid">
            {getMonthGrid(month).map((day, index) => {
              if (!day) return <View key={`blank-${index}`} className="cal-cell" />

              const isSelected = day.isSame(selected, 'day')
              const isToday = day.isSame(today, 'day')
              const events = eventsByDay[day.format('YYYY-MM-DD')] ?? []
              return (
                <View key={day.date()} className="cal-cell">
                  <Pressable
                    className={clsx('cal-day', isSelected ? 'cal-day-selected' : isToday && 'cal-day-today')}
                    onPress={() => setSelected(day)}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.format('MMMM D')}${events.length ? `, ${events.length} ${events.length === 1 ? 'event' : 'events'}` : ''}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text className={clsx('cal-day-text', (isSelected || isToday) && 'cal-day-text-strong', isSelected && 'cal-day-text-selected')}>
                      {day.date()}
                    </Text>
                    <View className="cal-dots">
                      {events.slice(0, 3).map((event) => (
                        <View key={event.id} className="cal-dot" style={{ backgroundColor: TYPE_COLORS[event.type] }} />
                      ))}
                    </View>
                  </Pressable>
                </View>
              )
            })}
          </View>
        </View>

        <View className="cal-legend">
          {LEGEND.map((item) => (
            <View key={item.type} className="cal-legend-item">
              <View className="cal-legend-dot" style={{ backgroundColor: TYPE_COLORS[item.type] }} />
              <Text className="cal-legend-text">{item.label}</Text>
            </View>
          ))}
        </View>

        <View className="cal-agenda">
          <Text className="cal-agenda-title">
            {selected.format('ddd, MMM D')}{isSelectedToday ? ' · Today' : ''}
          </Text>
          {agenda.length > 0 ? (
            agenda.map((event) => (
              <Pressable
                key={event.id}
                className="cal-event"
                onPress={() => router.push({ pathname: '/application/[id]', params: { id: event.applicationId } })}
                accessibilityRole="button"
              >
                <View className="cal-event-bar" style={{ backgroundColor: TYPE_COLORS[event.type] }} />
                <View className="cal-event-copy">
                  <Text className="cal-event-title" numberOfLines={1}>{event.title}</Text>
                  <Text className="cal-event-meta" numberOfLines={1}>{event.meta}</Text>
                </View>
                <Text className="cal-event-time">{dayjs(event.date).format('h:mm A')}</Text>
              </Pressable>
            ))
          ) : (
            <Text className="home-empty-state">Nothing due. Tap a day with a dot.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

export default Calendar
