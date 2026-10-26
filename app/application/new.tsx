import { Redirect, useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth-context'
import { useApplications } from '@/lib/applications-store'
import ApplicationForm from '@/components/ApplicationForm'

const NewApplication = () => {
  const router = useRouter()
  const { user, initializing } = useAuth()
  const { addApplication } = useApplications()

  if (initializing) return null
  if (!user) return <Redirect href="/sign-in" />

  return (
    <ApplicationForm
      onSave={async (input) => {
        // Doesn't wait for the server, so this works offline too
        const id = addApplication(input)
        // Swap this form for the new item's detail screen
        router.replace({ pathname: '/application/[id]', params: { id } })
      }}
    />
  )
}

export default NewApplication
