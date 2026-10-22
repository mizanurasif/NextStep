import { useState } from 'react'
import { View, Text, Pressable, Alert, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import clsx from 'clsx'
import { useApplications } from '@/lib/applications-store'
import { STAGES_BY_TYPE, STAGE_META } from '@/lib/applications'
import { SectionTitle } from '@/components/detail/DetailParts'

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Please try again')

// Alert buttons do nothing on web, so fall back to the browser's confirm dialog there
const confirmDelete = (onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm('Delete application? This cannot be undone.')) onConfirm()
    return
  }
  Alert.alert('Delete application?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ])
}

// Stage picker (update) and delete button shown under every application's details
const ApplicationActions = ({ application }: { application: Application }) => {
  const router = useRouter()
  const { updateApplication, deleteApplication } = useApplications()
  const [isBusy, setIsBusy] = useState(false)

  // The listener in ApplicationsProvider redraws the screen once Firebase confirms
  const changeStage = async (stage: ApplicationStage) => {
    if (isBusy || stage === application.stage) return
    setIsBusy(true)
    try {
      await updateApplication(application.id, { stage } as Partial<ApplicationInput>)
    } catch (error) {
      Alert.alert('Update failed', errorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  const handleDelete = () =>
    confirmDelete(async () => {
      setIsBusy(true)
      try {
        await deleteApplication(application.id)
        if (router.canGoBack()) router.back()
        else router.replace('/')
      } catch (error) {
        Alert.alert('Delete failed', errorMessage(error))
        setIsBusy(false)
      }
    })

  return (
    <View className="mt-6 gap-3">
      <SectionTitle>Move to stage</SectionTitle>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {STAGES_BY_TYPE[application.type].map((stage) => {
          const isCurrent = application.stage === stage
          return (
            <Pressable
              key={stage}
              className={clsx('reminder-chip', isCurrent && 'reminder-chip-on')}
              onPress={() => changeStage(stage)}
              disabled={isBusy}
              accessibilityRole="radio"
              accessibilityState={{ selected: isCurrent, disabled: isBusy }}
            >
              <Text className="reminder-chip-text">{STAGE_META[stage].label}</Text>
            </Pressable>
          )
        })}
      </View>

      <Pressable
        className="mt-4 items-center rounded-2xl border border-red-500/40 py-3"
        onPress={handleDelete}
        disabled={isBusy}
        accessibilityRole="button"
      >
        <Text className="text-base font-sans-bold text-red-500">Delete application</Text>
      </Pressable>
    </View>
  )
}

export default ApplicationActions
