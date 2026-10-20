import { ScrollView, Text, View } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import dayjs from 'dayjs'
import { APPLICATIONS } from '@/constants/data'
import { useAuth } from '@/lib/auth-context'
import { findApplication } from '@/lib/applications'
import { DetailTopBar } from '@/components/detail/DetailParts'
import JobDetail from '@/components/detail/JobDetail'
import UniversityDetail from '@/components/detail/UniversityDetail'
import ProfessorDetail from '@/components/detail/ProfessorDetail'

const SafeAreaView = styled(RNSafeAreaView)

// One screen for every application; the type decides which layout to show
const ApplicationScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user, initializing } = useAuth()

  if (initializing) return null
  if (!user) return <Redirect href="/sign-in" />

  const now = dayjs()
  const application = findApplication(APPLICATIONS, id)

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pt-5 pb-12" showsVerticalScrollIndicator={false}>
        {!application ? (
          <View>
            <DetailTopBar type="job" />
            <Text className="detail-title">Not found</Text>
            <Text className="detail-subtitle">This application may have been deleted.</Text>
          </View>
        ) : application.type === 'job' ? (
          <JobDetail job={application} now={now} />
        ) : application.type === 'university' ? (
          <UniversityDetail university={application} now={now} />
        ) : (
          <ProfessorDetail professor={application} now={now} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

export default ApplicationScreen
