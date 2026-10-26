import { Fragment, useState, type ReactNode } from 'react'
import { View, Text, Image, Pressable, Alert, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useApplications } from '@/lib/applications-store'
import clsx from 'clsx'
import dayjs, { type Dayjs } from 'dayjs'
import { colors } from '@/constants/theme'
import { icons } from '@/constants/icons'
import { TYPE_META, formatReminder, getSteps, getTimeDistance } from '@/lib/applications'

// Alert buttons do nothing on web, so fall back to the browser's confirm dialog there
const confirmDelete = (title: string, onConfirm: () => void) => {
  const message = `“${title}” will be deleted, with its reminders. This can't be undone.`
  if (Platform.OS === 'web') {
    if (window.confirm(`Delete application?\n\n${message}`)) onConfirm()
    return
  }
  Alert.alert('Delete application?', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ])
}

// Back on the left, the type in the middle, and Edit / Delete on the right when there's an application
export const DetailTopBar = ({ type, application }: { type: ApplicationType; application?: Application }) => {
  const router = useRouter()
  const { deleteApplication } = useApplications()
  const [isDeleting, setIsDeleting] = useState(false)
  const meta = TYPE_META[type]

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const handleDelete = () => {
    if (!application) return
    confirmDelete(application.title, () => {
      setIsDeleting(true)
      try {
        deleteApplication(application.id)
        goBack()
      } catch (error) {
        Alert.alert('Delete failed', error instanceof Error ? error.message : 'Please try again')
        setIsDeleting(false)
      }
    })
  }

  return (
    <View className="detail-topbar">
      {/* Equal-width sides keep the type chip centred */}
      <View className="flex-1 flex-row">
        <Pressable className="detail-back" onPress={goBack} accessibilityRole="button" accessibilityLabel="Back">
          <Image source={icons.back} className="size-5" tintColor={colors.primary} />
        </Pressable>
      </View>
      <View className={clsx('type-chip px-3.5 py-1.5', meta.chipClass)}>
        <Text className="type-chip-text">{meta.label}</Text>
      </View>
      <View className="flex-1 flex-row justify-end gap-2">
        {application && (
          <>
            <Pressable
              className="detail-back"
              onPress={() => router.push({ pathname: '/application/edit/[id]', params: { id: application.id } })}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel="Edit application"
            >
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </Pressable>
            <Pressable
              className="detail-back border-red-500/40"
              onPress={handleDelete}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel="Delete application"
              accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </Pressable>
          </>
        )}
      </View>
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

// The badge on KeyDateCard: "2 / days left", "5h 20m / left", "45 / min left", or the same with "ago" once passed
export const countdownBadge = (date: string, now: Dayjs, future: string, past: string) => {
  const { value, unit, inPast } = getTimeDistance(date, now)
  return { number: value, unit: [unit, inPast ? past : future].filter(Boolean).join(' ') }
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

// `anchor` is the date the reminders count back from, needed to show custom reminder times
export const ReminderChips = ({ reminders, anchor }: { reminders: Reminder[]; anchor?: string | null }) => (
  <View className="reminder-row">
    {reminders.map((reminder) => (
      <View key={reminder.id} className={clsx('reminder-chip', reminder.enabled && 'reminder-chip-on')}>
        <Text className="reminder-chip-text">
          {formatReminder(reminder, anchor)}
          {reminder.alarm ? ' · ⏰ alarm' : ''}
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

const NOTES_PREVIEW_LINES = 4
// 20px lines for 14px text, set directly because the `leading-5` class came out as a huge gap
const NOTES_LINE = { lineHeight: 20 }

// Takes only the room the text needs: runs of blank lines shrink to one, and long notes show
// the first few lines with "Show more"
export const Notes = ({ notes }: { notes?: string }) => {
  const [expanded, setExpanded] = useState(false)
  const [isLong, setIsLong] = useState(false)
  const text = notes?.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) return null

  return (
    <>
      <SectionTitle>Notes</SectionTitle>
      <View>
        {/* An invisible full-length copy counts the lines; the visible one may be cut short,
            and a cut-short Text only reports its visible lines on iOS */}
        <Text
          className="notes-text absolute left-0 right-0 opacity-0"
          style={NOTES_LINE}
          onTextLayout={(event) => setIsLong(event.nativeEvent.lines.length > NOTES_PREVIEW_LINES)}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          {text}
        </Text>
        <Text className="notes-text" style={NOTES_LINE} numberOfLines={expanded ? undefined : NOTES_PREVIEW_LINES}>
          {text}
        </Text>
      </View>
      {isLong && (
        <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button" hitSlop={8} className="mt-1 self-start">
          <Text className="text-sm font-sans-bold text-accent">{expanded ? 'Show less' : 'Show more'}</Text>
        </Pressable>
      )}
    </>
  )
}
