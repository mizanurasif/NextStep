import { View, Text, Pressable, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import clsx from 'clsx'
import dayjs, { type Dayjs } from 'dayjs'
import { useApplications } from '@/lib/applications-store'
import { findApplication, formatDaysAgo, getInitials, needsFollowUp } from '@/lib/applications'
import ApplicationCard from '@/components/ApplicationCard'
import {
  DetailTopBar,
  InfoRows,
  Notes,
  ReminderChips,
  SectionTitle,
  StageStepper,
  Timeline,
} from '@/components/detail/DetailParts'

// "Dr. Sarah Lin" → "SL" (titles aren't part of the initials)
const professorInitials = (name: string) => getInitials(name.replace(/^(dr|prof|professor)\.?\s+/i, ''))

const openEmail = (to: string, subject?: string) => {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : ''
  return Linking.openURL(`mailto:${to}${query}`)
}

// Headline, colour and main action for where this conversation stands
const getStatus = (professor: ProfessorApplication, now: Dayjs) => {
  const sent = professor.sentAt ? `Sent ${formatDaysAgo(professor.sentAt, now)} · ${dayjs(professor.sentAt).format('MMM D')}.` : ''
  const followUpSubject = professor.emailSubject ? `Re: ${professor.emailSubject}` : undefined

  switch (professor.stage) {
    case 'replied':
      return {
        cardClass: 'bg-professor',
        title: 'Replied',
        badge: professor.repliedAt ? dayjs(professor.repliedAt).format('MMM D') : undefined,
        text: 'Keep the conversation going and mention this lab in your application.',
        action: { label: 'Reply', subject: followUpSubject },
      }
    case 'declined':
      return { cardClass: 'bg-muted', title: 'Declined', text: 'Not taking students right now. Try other labs.', action: null }
    case 'draft':
      return { cardClass: 'bg-muted', title: 'Not sent yet', text: 'Write a short email about why their research interests you.', action: { label: 'Write email', subject: professor.emailSubject } }
    default:
      if (needsFollowUp(professor, now)) {
        return {
          cardClass: 'bg-accent',
          title: 'No reply yet',
          badge: 'Follow-up due',
          text: `${sent} A short, polite follow-up often gets a reply.`,
          action: { label: 'Send follow-up', subject: followUpSubject },
        }
      }
      return {
        cardClass: 'bg-muted',
        title: 'Waiting for a reply',
        badge: professor.followUpAt ? `Follow up ${dayjs(professor.followUpAt).format('MMM D')}` : undefined,
        text: sent,
        action: { label: 'Open email', subject: followUpSubject },
      }
  }
}

const ProfessorDetail = ({ professor, now }: { professor: ProfessorApplication; now: Dayjs }) => {
  const router = useRouter()
  const { applications } = useApplications()
  const status = getStatus(professor, now)
  const linked = professor.linkedApplicationId ? findApplication(applications, professor.linkedApplicationId) : undefined

  return (
    <View>
      <DetailTopBar type="professor" application={professor} />

      <View className="prof-header">
        <View className="prof-avatar">
          <Text className="prof-avatar-text">{professorInitials(professor.title)}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="detail-title mt-0 text-2xl">{professor.title}</Text>
          <Text className="detail-subtitle mt-0 text-sm">{professor.organization}</Text>
          <Pressable onPress={() => openEmail(professor.contactEmail)} accessibilityRole="link">
            <Text className="prof-email">{professor.contactEmail}</Text>
          </Pressable>
        </View>
      </View>

      <View className={clsx('status-card', status.cardClass)}>
        <View className="status-head">
          <Text className="status-title">{status.title}</Text>
          {status.badge && (
            <View className="status-badge">
              <Text className="status-badge-text">{status.badge}</Text>
            </View>
          )}
        </View>
        {status.text ? <Text className="status-text">{status.text}</Text> : null}
        {status.action && (
          <View className="flex-row">
            <Pressable
              className="status-action"
              onPress={() => openEmail(professor.contactEmail, status.action?.subject)}
              accessibilityRole="button"
            >
              <Text className="status-action-text">{status.action.label}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <SectionTitle>Progress</SectionTitle>
      <StageStepper application={professor} />

      <SectionTitle>Details</SectionTitle>
      <InfoRows
        rows={[
          { label: 'Deadline', value: professor.deadline && dayjs(professor.deadline).format('MMM D, YYYY · h:mm A') },
          { label: 'Research area', value: professor.researchArea },
          { label: 'Email subject', value: professor.emailSubject },
          { label: 'Sent on', value: professor.sentAt && dayjs(professor.sentAt).format('MMM D, YYYY') },
          { label: 'Follow up on', value: professor.stage !== 'replied' && professor.followUpAt ? dayjs(professor.followUpAt).format('MMM D, YYYY') : null },
          { label: 'Replied on', value: professor.repliedAt && dayjs(professor.repliedAt).format('MMM D, YYYY') },
        ]}
      />

      {linked && (
        <>
          <SectionTitle>Linked application</SectionTitle>
          <Pressable
            onPress={() => router.push({ pathname: '/application/[id]', params: { id: linked.id } })}
            accessibilityRole="button"
          >
            <ApplicationCard application={linked} now={now} />
          </Pressable>
        </>
      )}

      {professor.reminders.length > 0 && professor.stage !== 'replied' && professor.stage !== 'declined' && (
        <>
          <SectionTitle>Reminders</SectionTitle>
          <ReminderChips reminders={professor.reminders} anchor={professor.deadline} />
        </>
      )}

      {professor.timeline.length > 0 && (
        <>
          <SectionTitle>Timeline</SectionTitle>
          <Timeline events={professor.timeline} />
        </>
      )}

      <Notes notes={professor.notes} />
    </View>
  )
}

export default ProfessorDetail
