import { View, Text, Image, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import clsx from 'clsx'
import dayjs, { type Dayjs } from 'dayjs'
import { colors } from '@/constants/theme'
import { icons } from '@/constants/icons'
import { APPLICATIONS } from '@/constants/data'
import { getLinkedProfessors } from '@/lib/applications'
import { formatCurrency } from '@/lib/utils'
import ApplicationCard from '@/components/ApplicationCard'
import {
  DetailTopBar,
  InfoRows,
  KeyDateCard,
  Notes,
  ReminderChips,
  SectionTitle,
  StageStepper,
  Timeline,
  countdownBadge,
} from '@/components/detail/DetailParts'

const FULL_DATE = 'ddd, MMM D · h:mm A'

const getKeyDate = (university: UniversityApplication, now: Dayjs) => {
  if (university.stage === 'admitted') return { label: 'Decision', value: 'Admitted' }
  if (university.stage === 'rejected') return { label: 'Decision', value: 'Not admitted this time' }
  if ((university.stage === 'submitted' || university.stage === 'under_review') && university.submittedAt) {
    return {
      label: 'Submitted on',
      value: dayjs(university.submittedAt).format(FULL_DATE),
      badge: countdownBadge(university.submittedAt, now, 'left', 'ago'),
    }
  }
  if (university.deadline) {
    return {
      label: 'Application deadline',
      value: dayjs(university.deadline).format(FULL_DATE),
      badge: countdownBadge(university.deadline, now, 'left', 'ago'),
    }
  }
  return null
}

const formatFee = (fee?: Money) => {
  if (!fee) return null
  return fee.amount === 0 ? 'No fee' : formatCurrency(fee.amount, fee.currency)
}

const UniversityDetail = ({ university, now }: { university: UniversityApplication; now: Dayjs }) => {
  const router = useRouter()
  const keyDate = getKeyDate(university, now)
  const professors = getLinkedProfessors(APPLICATIONS, university.id)
  const readyCount = university.documents.filter((d) => d.done).length
  const subtitle = [university.organization, university.country, university.intake].filter(Boolean).join(' · ')

  return (
    <View>
      <DetailTopBar type="university" />
      <Text className="detail-title">{university.title}</Text>
      <Text className="detail-subtitle">{subtitle}</Text>

      {keyDate && <KeyDateCard {...keyDate} />}

      <SectionTitle>Stage</SectionTitle>
      <StageStepper application={university} />

      {university.link ? (
        <View className="detail-actions">
          <Pressable className="action-primary" onPress={() => WebBrowser.openBrowserAsync(university.link!)} accessibilityRole="link">
            <Image source={icons.link} className="size-4.5" tintColor={colors.primary} />
            <Text className="action-primary-text">Open program page</Text>
          </Pressable>
        </View>
      ) : null}

      {university.documents.length > 0 && (
        <>
          <SectionTitle>
            Documents · {readyCount} of {university.documents.length} ready
          </SectionTitle>
          <View className="info-card">
            {university.documents.map((doc, index) => (
              <View
                key={doc.name}
                className={clsx('doc-row', index < university.documents.length - 1 && 'info-row-divider')}
                accessibilityLabel={`${doc.name}, ${doc.done ? 'ready' : 'not ready'}`}
              >
                <View className={clsx('doc-check', doc.done && 'doc-check-done')}>
                  {doc.done && <Text className="doc-check-mark">✓</Text>}
                </View>
                <Text className={clsx('doc-name', doc.done && 'doc-name-done')}>{doc.name}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <SectionTitle>Details</SectionTitle>
      <InfoRows
        rows={[
          { label: 'Application fee', value: formatFee(university.applicationFee) },
          { label: 'Intake', value: university.intake },
          { label: 'Country', value: university.country },
          { label: 'Deadline', value: university.deadline && dayjs(university.deadline).format(FULL_DATE) },
        ]}
      />

      {professors.length > 0 && (
        <>
          <SectionTitle>Professors you contacted</SectionTitle>
          <View className="gap-2.5">
            {professors.map((professor) => (
              <Pressable
                key={professor.id}
                onPress={() => router.push({ pathname: '/application/[id]', params: { id: professor.id } })}
                accessibilityRole="button"
              >
                <ApplicationCard application={professor} now={now} />
              </Pressable>
            ))}
          </View>
        </>
      )}

      {university.reminders.length > 0 && (
        <>
          <SectionTitle>Reminders</SectionTitle>
          <ReminderChips reminders={university.reminders} />
        </>
      )}

      {university.timeline.length > 0 && (
        <>
          <SectionTitle>Timeline</SectionTitle>
          <Timeline events={university.timeline} />
        </>
      )}

      <Notes notes={university.notes} />
    </View>
  )
}

export default UniversityDetail
