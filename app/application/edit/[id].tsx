import { ActivityIndicator, Text, View } from 'react-native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { colors } from '@/constants/theme'
import { useAuth } from '@/lib/auth-context'
import { useApplications } from '@/lib/applications-store'
import { findApplication } from '@/lib/applications'
import ApplicationForm from '@/components/ApplicationForm'

// The add form, filled in with an existing application
const EditApplication = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user, initializing } = useAuth()
  const { applications, loading, editApplication } = useApplications()

  if (initializing) return null
  if (!user) return <Redirect href="/sign-in" />
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  const application = findApplication(applications, id)
  if (!application) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-5">
        <Text className="detail-subtitle">This application may have been deleted.</Text>
      </View>
    )
  }

  return (
    <ApplicationForm
      // A fresh form if a different application is opened in the same screen
      key={application.id}
      application={application}
      onSave={async (changes) => {
        // Doesn't wait for the server, so this works offline too
        editApplication(application.id, changes)
        router.back()
      }}
    />
  )
}

export default EditApplication
