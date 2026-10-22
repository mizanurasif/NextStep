import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import dayjs from 'dayjs'
import { colors } from '@/constants/theme'
import { useApplications } from '@/lib/applications-store'
import { useAuth } from '@/lib/auth-context'
import { findApplication } from '@/lib/applications'
import { DetailTopBar } from '@/components/detail/DetailParts'
import JobDetail from '@/components/detail/JobDetail'
import UniversityDetail from '@/components/detail/UniversityDetail'
import ProfessorDetail from '@/components/detail/ProfessorDetail'
import ApplicationActions from '@/components/detail/ApplicationActions'

const SafeAreaView = styled(RNSafeAreaView)

// One screen for every application; the type decides which layout to show
const ApplicationScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user, initializing } = useAuth()
  const { applications, loading, error } = useApplications()

  if (initializing) return null
  if (!user) return <Redirect href="/sign-in" />
  // Without this, opening the screen before the first snapshot would show "Not found"
  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    )
  }

  const now = dayjs()
  const application = findApplication(applications, id)

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pt-5 pb-12" showsVerticalScrollIndicator={false}>
        {!application ? (
          <View>
            <DetailTopBar type="job" />
            <Text className="detail-title">Not found</Text>
            <Text className="detail-subtitle">{error ?? 'This application may have been deleted.'}</Text>
          </View>
        ) : application.type === 'job' ? (
          <JobDetail job={application} now={now} />
        ) : application.type === 'university' ? (
          <UniversityDetail university={application} now={now} />
        ) : (
          <ProfessorDetail professor={application} now={now} />
        )}
        {application && <ApplicationActions application={application} />}
      </ScrollView>
    </SafeAreaView>
  )
}

export default ApplicationScreen
