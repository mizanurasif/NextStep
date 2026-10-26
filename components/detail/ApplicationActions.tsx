import { useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import clsx from 'clsx'
import { useApplications } from '@/lib/applications-store'
import { STAGES_BY_TYPE, STAGE_META } from '@/lib/applications'
import { SectionTitle } from '@/components/detail/DetailParts'

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Please try again')

// Stage picker shown under every application's details (edit and delete live in the top bar)
const ApplicationActions = ({ application }: { application: Application }) => {
  const { updateApplication } = useApplications()
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
    </View>
  )
}

export default ApplicationActions
