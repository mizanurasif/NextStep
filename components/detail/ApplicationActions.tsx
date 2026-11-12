import { View, Text, Pressable, Alert } from 'react-native'
import clsx from 'clsx'
import { router } from 'expo-router'
import { useApplications } from '@/lib/applications-store'
import { STAGE_META } from '@/lib/applications'
import { STAGES_BY_TYPE, changeStage } from '@/lib/stage-transition'
import { SectionTitle } from '@/components/detail/DetailParts'

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Please try again')

// Stage picker and the AI chat button, shown under every application's details (edit and delete live in the top bar)
const ApplicationActions = ({ application }: { application: Application }) => {
  const { updateApplication } = useApplications()
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
      {/* The research chat, starting from this application */}
      <Pressable
        className="auth-secondary-button mt-3"
        onPress={() => router.push({ pathname: '/ask', params: { applicationId: application.id } })}
        accessibilityRole="button"
      >
        <Text className="auth-secondary-button-text">✨ Ask about this application</Text>
      </Pressable>
    </View>
  )
}

export default ApplicationActions
