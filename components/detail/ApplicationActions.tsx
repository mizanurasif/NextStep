import { View, Text, Pressable, Alert } from 'react-native'
import clsx from 'clsx'
import { router } from 'expo-router'
import { useApplications } from '@/lib/applications-store'
import { STAGE_META } from '@/lib/applications'
import { STAGES_BY_TYPE, changeStage } from '@/lib/stage-transition'
import { SectionTitle } from '@/components/detail/DetailParts'
import { useAiAccess, whenAllowed } from '@/lib/ai/access'

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Please try again')

// Stage picker and the AI chat button, shown under every application's details (edit and delete live in the top bar)
const ApplicationActions = ({ application }: { application: Application }) => {
  const { updateApplication } = useApplications()
  const { research } = useAiAccess()
  // The listener in ApplicationsProvider redraws the screen straight from the local cache, even offline.
  // changeStage also stamps the stage's date (e.g. sent → follow-up reminder) and the timeline
  const moveTo = (stage: ApplicationStage) => {
    if (stage === application.stage) return
    try {
      updateApplication(application.id, changeStage(application, stage))
    } catch (error) {
      Alert.alert('Update failed', errorMessage(error))
    }
  }

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
              onPress={() => moveTo(stage)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isCurrent }}
            >
              <Text className="reminder-chip-text">{STAGE_META[stage].label}</Text>
            </Pressable>
          )
        })}
      </View>
      {/* The research chat, starting from this application. Needs the user's own AI key: without
          one the button looks disabled and a tap explains where to add it */}
      <Pressable
        className={clsx('auth-secondary-button mt-3', !research.allowed && 'opacity-50')}
        onPress={whenAllowed(research, () => router.push({ pathname: '/ask', params: { applicationId: application.id } }))}
        accessibilityRole="button"
        accessibilityState={{ disabled: !research.allowed }}
      >
        <Text className="auth-secondary-button-text">✨ Ask about this application</Text>
      </Pressable>
    </View>
  )
}

export default ApplicationActions
