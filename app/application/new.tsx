import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Image, Switch, Alert } from 'react-native'
import { Redirect, Stack, useRouter } from 'expo-router'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { colors } from '@/constants/theme'
import { useAuth } from '@/lib/auth-context'
import { useApplications } from '@/lib/applications-store'
import { FOLLOW_UP_DAYS, STAGE_META, TYPE_META, getReminderPresets, isValidReminderTime } from '@/lib/applications'
import DateTimeField from '@/components/DateTimeField'

const SafeAreaView = styled(RNSafeAreaView)

const TYPES: ApplicationType[] = ['job', 'university', 'professor']

// The stages that make sense when adding something new
const START_STAGES: Record<ApplicationType, ApplicationStage[]> = {
  job: ['saved', 'applied'],
  university: ['preparing', 'submitted'],
  professor: ['draft', 'sent'],
}

// Field labels change with the type, so one form fits all three
const COPY: Record<ApplicationType, { title: string; titlePlaceholder: string; org: string; orgPlaceholder: string; link: string }> = {
  job: { title: 'Role', titlePlaceholder: 'e.g. Frontend Developer', org: 'Company', orgPlaceholder: 'e.g. TechNova Ltd', link: 'Circular link' },
  university: { title: 'Program', titlePlaceholder: 'e.g. MSc Computer Science', org: 'University', orgPlaceholder: 'e.g. University of Alberta', link: 'Program page' },
  professor: { title: 'Professor', titlePlaceholder: 'e.g. Dr. Sarah Lin', org: 'Lab · University', orgPlaceholder: 'e.g. ML Lab · University of Alberta', link: 'Profile page' },
}

const CUSTOM_FORMAT = 'MMM D, h:mm A'

// Adds https:// when someone types "example.com/jobs"
const normalizeLink = (link: string) => {
  const trimmed = link.trim()
  if (!trimmed) return undefined
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const defaultDeadline = () => dayjs().add(7, 'day').hour(23).minute(59).second(0).millisecond(0).toDate()

const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <View className="auth-field">
    <Text className="auth-label">{label}</Text>
    {children}
    {error ? <Text className="auth-error">{error}</Text> : null}
  </View>
)

const NewApplication = () => {
  const router = useRouter()
  const { user, initializing } = useAuth()
  const { addApplication } = useApplications()

  const [type, setType] = useState<ApplicationType>('job')
  const [stage, setStage] = useState<ApplicationStage>('saved')
  const [title, setTitle] = useState('')
  const [organization, setOrganization] = useState('')
  const [link, setLink] = useState('')
  const [hasDeadline, setHasDeadline] = useState(true)
  const [deadline, setDeadline] = useState(defaultDeadline)
  // Nothing is picked by default; the user chooses presets (by key) and adds custom times
  const [presetKeys, setPresetKeys] = useState<string[]>([])
  const [customTimes, setCustomTimes] = useState<Date[]>([])
  // The custom time being picked, before it's added
  const [customDraft, setCustomDraft] = useState<Date | null>(null)
  const [location, setLocation] = useState('')
  const [country, setCountry] = useState('')
  const [intake, setIntake] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [researchArea, setResearchArea] = useState('')
  const [sentAt, setSentAt] = useState(() => new Date())
  const [notes, setNotes] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  if (initializing) return null
  if (!user) return <Redirect href="/sign-in" />

  const copy = COPY[type]
  const isProfessor = type === 'professor'
  const usesReminders = !isProfessor && hasDeadline
  const now = dayjs()
  const deadlineDay = dayjs(deadline)
  // The choices follow the deadline: a far deadline offers 1 week / 3 days / on the day, a close one just 1 hour
  const presets = getReminderPresets(deadline, now)
  const isValidTime = (time: Date) => isValidReminderTime(dayjs(time), deadlineDay, now)
  const draftError = customDraft && !isValidTime(customDraft) ? 'Pick a time at least 1 minute from now and before the deadline' : ''

  const errors = {
    title: title.trim() ? '' : `Enter the ${copy.title.toLowerCase()}`,
    organization: organization.trim() ? '' : `Enter the ${copy.org.split(' ')[0].toLowerCase()}`,
    contactEmail: !isProfessor || contactEmail.trim().includes('@') ? '' : 'Enter a valid email address',
    // Custom times can fall behind if the form stays open or the deadline moves
    reminders: usesReminders && customTimes.some((time) => !isValidTime(time)) ? 'Remove reminders that are in the past or after the deadline' : '',
  }
  const isValid = !errors.title && !errors.organization && !errors.contactEmail && !errors.reminders

  const changeType = (next: ApplicationType) => {
    setType(next)
    setStage(START_STAGES[next][0])
    setShowErrors(false)
  }

  const togglePreset = (key: string) =>
    setPresetKeys((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]))

  // Starts the picker an hour before the deadline, or a few minutes from now when that's too close
  const startCustom = () => {
    const hourBefore = deadlineDay.subtract(1, 'hour').second(0).millisecond(0)
    setCustomDraft((isValidTime(hourBefore.toDate()) ? hourBefore : now.add(5, 'minute').second(0).millisecond(0)).toDate())
  }

  const addCustom = () => {
    if (!customDraft || draftError) return
    setCustomTimes((current) => [...current, customDraft].sort((a, b) => a.getTime() - b.getTime()))
    setCustomDraft(null)
  }

  // Presets that no longer fit the deadline are dropped; `kind` is only set when needed,
  // since Firebase rejects undefined values
  const buildReminders = (): Reminder[] =>
    [
      ...presets
        .filter((preset) => presetKeys.includes(preset.key))
        .map((preset) => (preset.kind ? { minutesBefore: preset.minutesBefore, kind: preset.kind } : { minutesBefore: preset.minutesBefore })),
      ...customTimes.map((time) => ({ minutesBefore: deadlineDay.diff(time, 'minute'), kind: 'custom' as const })),
    ].map((reminder, i) => ({ id: `r${i + 1}`, enabled: true, ...reminder }))

  const handleSave = async () => {
    if (isSaving) return
    if (!isValid) {
      setShowErrors(true)
      return
    }

    const now = new Date().toISOString()
    const base = {
      title: title.trim(),
      organization: organization.trim(),
      link: normalizeLink(link),
      notes: notes.trim() || undefined,
    }
    const firstEvent = (eventTitle: string, date = now): TimelineEvent[] => [{ id: 't1', date, title: eventTitle }]

    let input: ApplicationInput
    if (type === 'job') {
      const applied = stage === 'applied'
      input = {
        ...base,
        type: 'job',
        stage: stage as JobStage,
        deadline: hasDeadline ? deadline.toISOString() : null,
        location: location.trim() || undefined,
        appliedAt: applied ? now : null,
        interviewAt: null,
        reminders: hasDeadline ? buildReminders() : [],
        timeline: firstEvent(applied ? 'Applied' : 'Saved circular'),
      }
    } else if (type === 'university') {
      const submitted = stage === 'submitted'
      input = {
        ...base,
        type: 'university',
        stage: stage as UniversityStage,
        deadline: hasDeadline ? deadline.toISOString() : null,
        country: country.trim() || undefined,
        intake: intake.trim() || undefined,
        submittedAt: submitted ? now : null,
        documents: [],
        reminders: hasDeadline ? buildReminders() : [],
        timeline: firstEvent(submitted ? 'Submitted' : 'Started application'),
      }
    } else {
      const sent = stage === 'sent'
      const sentDate = sent ? sentAt.toISOString() : null
      input = {
        ...base,
        type: 'professor',
        stage: stage as ProfessorStage,
        deadline: null,
        contactEmail: contactEmail.trim(),
        emailSubject: emailSubject.trim() || undefined,
        researchArea: researchArea.trim() || undefined,
        sentAt: sentDate,
        followUpAt: sentDate ? dayjs(sentDate).add(FOLLOW_UP_DAYS, 'day').toISOString() : null,
        repliedAt: null,
        reminders: sent ? [{ id: 'r1', minutesBefore: 0, enabled: true }] : [],
        timeline: sent ? firstEvent('First email sent', sentDate!) : firstEvent('Draft created'),
      }
    }

    setIsSaving(true)
    try {
      const id = await addApplication(input)
      // Swap this form for the new item's detail screen
      router.replace({ pathname: '/application/[id]', params: { id } })
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="modal-header">
          <Text className="modal-title" accessibilityRole="header">New application</Text>
          <Pressable className="modal-close" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
            <Text className="modal-close-text">✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="gap-4 px-5 py-4" keyboardShouldPersistTaps="handled">
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            {TYPES.map((option) => {
              const meta = TYPE_META[option]
              const isActive = type === option
              return (
                <Pressable
                  key={option}
                  className={clsx('type-option', isActive && ['type-option-active', meta.chipClass])}
                  onPress={() => changeType(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                >
                  <Image source={meta.icon} className="size-5" tintColor={colors.primary} />
                  <Text className="type-option-text">{meta.label}</Text>
                </Pressable>
              )
            })}
          </View>

          <Field label={copy.title} error={showErrors ? errors.title : ''}>
            <TextInput
              className={clsx('auth-input', showErrors && errors.title && 'auth-input-error')}
              value={title}
              onChangeText={setTitle}
              placeholder={copy.titlePlaceholder}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </Field>

          <Field label={copy.org} error={showErrors ? errors.organization : ''}>
            <TextInput
              className={clsx('auth-input', showErrors && errors.organization && 'auth-input-error')}
              value={organization}
              onChangeText={setOrganization}
              placeholder={copy.orgPlaceholder}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </Field>

          {isProfessor && (
            <>
              <Field label="Email address" error={showErrors ? errors.contactEmail : ''}>
                <TextInput
                  className={clsx('auth-input', showErrors && errors.contactEmail && 'auth-input-error')}
                  value={contactEmail}
                  onChangeText={setContactEmail}
                  placeholder="name@university.edu"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </Field>
              <Field label="Email subject">
                <TextInput
                  className="auth-input"
                  value={emailSubject}
                  onChangeText={setEmailSubject}
                  placeholder="e.g. Prospective MSc student – interest in your lab"
                  placeholderTextColor={colors.mutedForeground}
                />
              </Field>
              <Field label="Research area">
                <TextInput
                  className="auth-input"
                  value={researchArea}
                  onChangeText={setResearchArea}
                  placeholder="e.g. Machine learning, NLP"
                  placeholderTextColor={colors.mutedForeground}
                />
              </Field>
            </>
          )}

          <Field label={copy.link}>
            <TextInput
              className="auth-input"
              value={link}
              onChangeText={setLink}
              placeholder="https://…"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>

          {type === 'job' && (
            <Field label="Location">
              <TextInput
                className="auth-input"
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Dhaka, Remote"
                placeholderTextColor={colors.mutedForeground}
              />
            </Field>
          )}

          {type === 'university' && (
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Field label="Country">
                  <TextInput className="auth-input" value={country} onChangeText={setCountry} placeholder="e.g. Canada" placeholderTextColor={colors.mutedForeground} />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Intake">
                  <TextInput className="auth-input" value={intake} onChangeText={setIntake} placeholder="e.g. Fall 2027" placeholderTextColor={colors.mutedForeground} />
                </Field>
              </View>
            </View>
          )}

          <Field label="Stage">
            <View className="reminder-row">
              {START_STAGES[type].map((option) => (
                <Pressable
                  key={option}
                  className={clsx('reminder-chip', stage === option && 'reminder-chip-on')}
                  onPress={() => setStage(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: stage === option }}
                >
                  <Text className="reminder-chip-text">{STAGE_META[option].label === 'Waiting' ? 'Sent' : STAGE_META[option].label}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          {isProfessor ? (
            stage === 'sent' && (
              <Field label="Email sent on">
                <DateTimeField label="Email sent on" value={sentAt} onChange={setSentAt} withTime={false} />
                <Text className="auth-helper">You&apos;ll be reminded to follow up after {FOLLOW_UP_DAYS} days.</Text>
              </Field>
            )
          ) : (
            <>
              <View className="toggle-row">
                <Text className="toggle-label">Has a deadline</Text>
                <Switch
                  value={hasDeadline}
                  onValueChange={setHasDeadline}
                  trackColor={{ true: colors.accent, false: colors.muted }}
                  thumbColor={colors.card}
                  accessibilityLabel="Has a deadline"
                />
              </View>
              {hasDeadline && (
                <>
                  <Field label="Deadline">
                    <DateTimeField label="Deadline" value={deadline} onChange={setDeadline} />
                  </Field>
                  <Field label="Remind me" error={showErrors ? errors.reminders : ''}>
                    <View className="reminder-row">
                      {presets.map((preset) => {
                        const isOn = presetKeys.includes(preset.key)
                        return (
                          <Pressable
                            key={preset.key}
                            className={clsx('reminder-chip', isOn && 'reminder-chip-on')}
                            onPress={() => togglePreset(preset.key)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isOn }}
                          >
                            <Text className="reminder-chip-text">{preset.label}</Text>
                          </Pressable>
                        )
                      })}
                      {customTimes.map((time) => (
                        <Pressable
                          key={time.getTime()}
                          className="reminder-chip reminder-chip-on"
                          onPress={() => setCustomTimes((current) => current.filter((t) => t !== time))}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove reminder at ${dayjs(time).format(CUSTOM_FORMAT)}`}
                        >
                          <Text className="reminder-chip-text">{dayjs(time).format(CUSTOM_FORMAT)}  ✕</Text>
                        </Pressable>
                      ))}
                      {!customDraft && deadlineDay.isAfter(now.add(1, 'minute')) && (
                        <Pressable className="reminder-chip" onPress={startCustom} accessibilityRole="button">
                          <Text className="reminder-chip-text">+ Custom</Text>
                        </Pressable>
                      )}
                    </View>
                    {customDraft && (
                      <View className="mt-2.5 gap-2.5">
                        <DateTimeField label="Custom reminder" value={customDraft} onChange={setCustomDraft} />
                        {draftError ? <Text className="auth-error">{draftError}</Text> : null}
                        <View className="flex-row gap-2">
                          <Pressable className="reminder-chip" onPress={() => setCustomDraft(null)} accessibilityRole="button">
                            <Text className="reminder-chip-text">Cancel</Text>
                          </Pressable>
                          <Pressable
                            className={clsx('reminder-chip reminder-chip-on', draftError && 'opacity-50')}
                            onPress={addCustom}
                            disabled={!!draftError}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !!draftError }}
                          >
                            <Text className="reminder-chip-text">Add reminder</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                    <Text className="auth-helper">You&apos;ll always be notified when the deadline passes.</Text>
                  </Field>
                </>
              )}
            </>
          )}

          <Field label="Notes">
            <TextInput
              className="auth-input min-h-24"
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything to remember"
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
            />
          </Field>
        </ScrollView>

        <View className="form-footer">
          <Pressable
            className={clsx('auth-button', (!isValid || isSaving) && 'auth-button-disabled')}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaving, busy: isSaving }}
          >
            <Text className="auth-button-text">{isSaving ? 'Saving…' : 'Save application'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default NewApplication
