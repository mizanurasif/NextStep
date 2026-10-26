import { useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import dayjs from 'dayjs'
import type { Notification } from 'react-native-notify-kit'
import { SNOOZE_MINUTES, getAlarm, snoozeAlarm, stopAlarm } from '@/lib/alarms'

const SafeAreaView = styled(RNSafeAreaView)

// The full-screen ringing alarm (Android): shows what it's about, with Stop and Snooze
const AlarmScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [alarm, setAlarm] = useState<Notification | null>(null)
  const [now, setNow] = useState(() => dayjs())

  useEffect(() => {
    getAlarm(id).then((found) => {
      // Already stopped (from the notification, or it timed out): nothing to show
      if (!found) router.back()
      else setAlarm(found)
    })
  }, [id, router])

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [])

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const stop = async () => {
    await stopAlarm(id)
    close()
  }

  const snooze = async () => {
    if (alarm) await snoozeAlarm(alarm)
    close()
  }

  const openApplication = async () => {
    await stopAlarm(id)
    const applicationId = alarm?.data?.applicationId
    if (typeof applicationId === 'string' && applicationId) {
      router.replace({ pathname: '/application/[id]', params: { id: applicationId } })
    } else close()
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-between bg-primary px-6 py-12">
      <Stack.Screen options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />

      <View className="items-center gap-2">
        <Text className="text-6xl font-sans-bold text-background">{now.format('h:mm')}</Text>
        <Text className="text-base font-sans-medium text-background/70">{now.format('dddd, MMM D')}</Text>
      </View>

      <View className="items-center gap-3">
        <Text className="text-6xl">⏰</Text>
        <Text className="text-center text-2xl font-sans-bold text-background" accessibilityRole="header">
          {alarm?.title?.replace(/^⏰ /, '') ?? 'Alarm'}
        </Text>
        {alarm?.body ? <Text className="text-center text-base font-sans-medium text-background/80">{alarm.body}</Text> : null}
        <Pressable onPress={openApplication} accessibilityRole="link" hitSlop={8}>
          <Text className="font-sans-semibold text-accent underline">Open application</Text>
        </Pressable>
      </View>

      <View className="w-full gap-3">
        <Pressable className="items-center rounded-full bg-accent py-5" onPress={stop} accessibilityRole="button">
          <Text className="text-lg font-sans-bold text-primary">Stop</Text>
        </Pressable>
        <Pressable className="items-center rounded-full border border-background/40 py-5" onPress={snooze} accessibilityRole="button">
          <Text className="text-lg font-sans-semibold text-background">Snooze {SNOOZE_MINUTES} min</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

export default AlarmScreen
