import { Fragment, type ReactNode } from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import clsx from 'clsx'
import dayjs, { type Dayjs } from 'dayjs'
import { colors } from '@/constants/theme'
import { icons } from '@/constants/icons'
import { TYPE_META, formatReminder, getSteps, getTimeDistance } from '@/lib/applications'

export const DetailTopBar = ({ type }: { type: ApplicationType }) => {
  const router = useRouter()
  const meta = TYPE_META[type]

  return (
    <View className="detail-topbar">
      <Pressable
        className="detail-back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Image source={icons.back} className="size-5" tintColor={colors.primary} />
      </Pressable>
      <View className={clsx('type-chip px-3.5 py-1.5', meta.chipClass)}>
        <Text className="type-chip-text">{meta.label}</Text>
      </View>
      {/* Keeps the chip centred until an edit button lives here */}
      <View className="size-11" />
    </View>
  )
}

export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <Text className="section-title" accessibilityRole="header">{children}</Text>
)

// The navy card with the one date that matters most and an optional countdown badge
export const KeyDateCard = ({ label, value, badge }: { label: string; value: string; badge?: { number: string; unit: string } }) => (
  <View className="key-card">
    <View className="flex-1">
      <Text className="key-card-label">{label}</Text>
      <Text className="key-card-value">{value}</Text>
    </View>
    {badge && (
      <View className="key-card-badge">
        <Text className="key-card-badge-number">{badge.number}</Text>
        <Text className="key-card-badge-unit">{badge.unit}</Text>
      </View>
    )}
  </View>
)

// The badge on KeyDateCard: "5 / hours left" when under a day away, otherwise "2 / days left" or "9 / days ago"
export const countdownBadge = (date: string, now: Dayjs, future: string, past: string) => {
  const { value, unit, inPast } = getTimeDistance(date, now)
  return { number: String(value), unit: `${unit} ${inPast ? past : future}` }
}

export const StageStepper = ({ application }: { application: Application }) => (
  <View className="stepper" accessibilityLabel="Progress">
    {getSteps(application).map((step, index) => (
      <View key={step.label} className="step">
        <View
          className={clsx('step-dot', {
            'step-dot-done': step.state === 'done',
            'step-dot-current': step.state === 'current',
            'step-dot-todo': step.state === 'todo',
            'step-dot-failed': step.state === 'failed',
          })}
        >
          <Text className={clsx('step-dot-text', step.state === 'done' && 'step-dot-text-done')}>
            {step.state === 'done' ? '✓' : step.state === 'failed' ? '✕' : index + 1}
          </Text>
        </View>
        <Text className={clsx('step-label', step.state === 'todo' && 'step-label-todo')}>{step.label}</Text>
      </View>
    ))}
  </View>
)

export const InfoRows = ({ rows }: { rows: { label: string; value?: string | null }[] }) => {
  const visible = rows.filter((row) => row.value)
  if (visible.length === 0) return null

  return (
    <View className="info-card">
      {visible.map((row, index) => (
        <View key={row.label} className={clsx('info-row', index < visible.length - 1 && 'info-row-divider')}>
          <Text className="info-label">{row.label}</Text>
          <Text className="info-value" numberOfLines={2}>{row.value}</Text>
        </View>
      ))}
    </View>
  )
}

export const EventCard = ({ date, title, meta }: { date: string; title: string; meta: string }) => (
  <View className="event-card">
    <View className="date-tile">
      <Text className="date-tile-month">{dayjs(date).format('MMM').toUpperCase()}</Text>
      <Text className="date-tile-day">{dayjs(date).format('D')}</Text>
    </View>
    <View className="flex-1">
      <Text className="event-title">{title}</Text>
      <Text className="event-meta">{meta}</Text>
    </View>
  </View>
)

export const ReminderChips = ({ reminders }: { reminders: Reminder[] }) => (
  <View className="reminder-row">
    {reminders.map((reminder) => (
      <View key={reminder.id} className={clsx('reminder-chip', reminder.enabled && 'reminder-chip-on')}>
        <Text className="reminder-chip-text">
          {formatReminder(reminder.minutesBefore)}
          {reminder.enabled ? '' : ' · off'}
        </Text>
      </View>
    ))}
  </View>
)

// Newest event first, so the latest news is at the top
export const Timeline = ({ events }: { events: TimelineEvent[] }) => {
  const sorted = [...events].sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())

  return (
    <View>
      {sorted.map((event, index) => (
        <Fragment key={event.id}>
          <View className="timeline-item">
            <View className="timeline-rail">
              <View className="timeline-dot" />
              {index < sorted.length - 1 && <View className="timeline-line" />}
            </View>
            <View className="timeline-body">
              <Text className="timeline-date">{dayjs(event.date).format('MMM D, YYYY')}</Text>
              <Text className="timeline-title">{event.title}</Text>
              {event.detail ? <Text className="timeline-detail">{event.detail}</Text> : null}
            </View>
          </View>
        </Fragment>
      ))}
    </View>
  )
}

export const Notes = ({ notes }: { notes?: string }) =>
  notes ? (
    <>
      <SectionTitle>Notes</SectionTitle>
      <Text className="notes-text">{notes}</Text>
    </>
  ) : null
