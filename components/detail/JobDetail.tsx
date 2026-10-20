import { View, Text, Image, Pressable } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import dayjs, { type Dayjs } from 'dayjs'
import { colors } from '@/constants/theme'
import { icons } from '@/constants/icons'
import {
  DetailTopBar,
  EventCard,
  InfoRows,
  KeyDateCard,
  Notes,
  ReminderChips,
  SectionTitle,
  StageStepper,
  Timeline,
  countdownBadge,
} from '@/components/detail/DetailParts'

const EMPLOYMENT_LABELS: Record<NonNullable<JobApplication['employmentType']>, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  internship: 'Internship',
  contract: 'Contract',
}

const WORK_MODE_LABELS: Record<NonNullable<JobApplication['workMode']>, string> = {
  onsite: 'On-site',
  remote: 'Remote',
  hybrid: 'Hybrid',
}

const FULL_DATE = 'ddd, MMM D · h:mm A'

// The one date that matters most right now for this job
const getKeyDate = (job: JobApplication, now: Dayjs) => {
  if (job.stage === 'interview' && job.interviewAt) {
    return { label: 'Interview', value: dayjs(job.interviewAt).format(FULL_DATE), badge: countdownBadge(job.interviewAt, now, 'to go', 'ago') }
  }
  if ((job.stage === 'applied' || job.stage === 'interview') && job.appliedAt) {
    return { label: 'Applied on', value: dayjs(job.appliedAt).format(FULL_DATE), badge: countdownBadge(job.appliedAt, now, 'left', 'ago') }
  }
  if (job.stage === 'rejected') {
    return { label: 'Outcome', value: 'Not selected this time' }
  }
  if (job.deadline) {
    const label = job.stage === 'offer' ? 'Reply to the offer by' : 'Application deadline'
    return { label, value: dayjs(job.deadline).format(FULL_DATE), badge: countdownBadge(job.deadline, now, 'left', 'ago') }
  }
  return null
}

const JobDetail = ({ job, now }: { job: JobApplication; now: Dayjs }) => {
  const keyDate = getKeyDate(job, now)
  const subtitle = [job.organization, job.location, job.employmentType && EMPLOYMENT_LABELS[job.employmentType]]
    .filter(Boolean)
    .join(' · ')

  return (
    <View>
      <DetailTopBar type="job" />
      <Text className="detail-title">{job.title}</Text>
      <Text className="detail-subtitle">{subtitle}</Text>

      {keyDate && <KeyDateCard {...keyDate} />}

      <SectionTitle>Stage</SectionTitle>
      <StageStepper application={job} />

      {job.link ? (
        <View className="detail-actions">
          <Pressable className="action-primary" onPress={() => WebBrowser.openBrowserAsync(job.link!)} accessibilityRole="link">
            <Image source={icons.link} className="size-4.5" tintColor={colors.primary} />
            <Text className="action-primary-text">Open circular</Text>
          </Pressable>
        </View>
      ) : null}

      {job.interviewAt ? (
        <>
          <SectionTitle>Interview</SectionTitle>
          <EventCard
            date={job.interviewAt}
            title={dayjs(job.interviewAt).isAfter(now) ? 'Upcoming interview' : 'Interview'}
            meta={[dayjs(job.interviewAt).format('ddd · h:mm A'), job.interviewMode].filter(Boolean).join(' · ')}
          />
        </>
      ) : null}

      <SectionTitle>Details</SectionTitle>
      <InfoRows
        rows={[
          { label: 'Salary', value: job.salary },
          { label: 'Work mode', value: job.workMode && WORK_MODE_LABELS[job.workMode] },
          { label: 'Type', value: job.employmentType && EMPLOYMENT_LABELS[job.employmentType] },
          { label: 'Location', value: job.location },
          { label: 'Deadline', value: job.deadline && dayjs(job.deadline).format(FULL_DATE) },
        ]}
      />

      {job.reminders.length > 0 && (
        <>
          <SectionTitle>Reminders</SectionTitle>
          <ReminderChips reminders={job.reminders} />
        </>
      )}

      {job.timeline.length > 0 && (
        <>
          <SectionTitle>Timeline</SectionTitle>
          <Timeline events={job.timeline} />
        </>
      )}

      <Notes notes={job.notes} />
    </View>
  )
}

export default JobDetail
