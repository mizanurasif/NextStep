import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Keyboard, Image, Switch, Alert, ActivityIndicator } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { colors } from '@/constants/theme'
import { STAGE_META, TYPE_META } from '@/lib/applications'
import {
  canAddCustomTime,
  choicesToReminders,
  formatReminderTime,
  getCustomTimeError,
  getCustomTimesError,
  getReminderPresets,
  listPickedReminders,
  remindersToChoices,
  suggestCustomTime,
} from '@/lib/reminders'
import { FOLLOW_UP_DAYS, STAGES_BY_TYPE, changeStage } from '@/lib/stage-transition'
import DateTimeField from '@/components/DateTimeField'
import { ensureAlarmPermissions } from '@/lib/alarms'
import { MAX_CIRCULAR_CHARS, extractCircular, type CircularFields } from '@/lib/ai'

const SafeAreaView = styled(RNSafeAreaView)

const TYPES: ApplicationType[] = ['job', 'university', 'professor']

// The stages that make sense when adding something new; editing offers every stage
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

type Props = {
  // Editing when given: every field starts from it and the type can't change
  application?: Application
  // Gets the full application for a new one, or only the edited fields for an existing one
  onSave: (input: ApplicationInput) => Promise<void>
}

// The add / edit form for every type of application
const ApplicationForm = ({ application, onSave }: Props) => {
  const router = useRouter()
  const isEditing = !!application
  // The saved reminders as chips, worked out once when the form opens (see lib/reminders)
  const [initialReminders] = useState(() =>
    remindersToChoices(application?.reminders ?? [], application?.deadline ?? null, dayjs()),
  )

  const [type, setType] = useState<ApplicationType>(application?.type ?? 'job')
  const [stage, setStage] = useState<ApplicationStage>(application?.stage ?? 'saved')
  const [title, setTitle] = useState(application?.title ?? '')
  const [organization, setOrganization] = useState(application?.organization ?? '')
  const [link, setLink] = useState(application?.link ?? '')
  const [hasDeadline, setHasDeadline] = useState(application ? !!application.deadline : true)
  const [deadline, setDeadline] = useState(() => (application?.deadline ? new Date(application.deadline) : defaultDeadline()))
  // Nothing is picked by default; the user chooses presets (by key) and adds custom times
  const [presetKeys, setPresetKeys] = useState<string[]>(initialReminders.presetKeys)
  const [customTimes, setCustomTimes] = useState<Date[]>(initialReminders.customTimes)
  // The custom time being picked, before it's added
  const [customDraft, setCustomDraft] = useState<Date | null>(null)
  // Reminders (by preset key or custom key) that should also ring an alarm
  const [alarmKeys, setAlarmKeys] = useState<string[]>(initialReminders.alarmKeys)
  const [location, setLocation] = useState(application?.type === 'job' ? (application.location ?? '') : '')
  const [country, setCountry] = useState(application?.type === 'university' ? (application.country ?? '') : '')
  const [intake, setIntake] = useState(application?.type === 'university' ? (application.intake ?? '') : '')
  const [contactEmail, setContactEmail] = useState(application?.type === 'professor' ? application.contactEmail : '')
  const [emailSubject, setEmailSubject] = useState(application?.type === 'professor' ? (application.emailSubject ?? '') : '')
  const [researchArea, setResearchArea] = useState(application?.type === 'professor' ? (application.researchArea ?? '') : '')
  const [sentAt, setSentAt] = useState(() =>
    application?.type === 'professor' && application.sentAt ? new Date(application.sentAt) : new Date(),
  )
  const [notes, setNotes] = useState(application?.notes ?? '')
  const [showErrors, setShowErrors] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // "Fill from a circular": the pasted text, and whether the AI is reading it or has filled the form
  const [circularOpen, setCircularOpen] = useState(false)
  const [circularText, setCircularText] = useState('')
  const [isReadingCircular, setIsReadingCircular] = useState(false)
  const [circularError, setCircularError] = useState('')
  // The circular the form was filled from, saved with a new application so the research agent can read it
  const [circular, setCircular] = useState<CircularSource | null>(null)

  // Notes is the last field, so showing it while typing means scrolling to the end
  const scrollRef = useRef<ScrollView>(null)
  const notesFocused = useRef(false)
  const scrollToNotes = () => scrollRef.current?.scrollToEnd({ animated: true })

  // The keyboard finishes opening after the focus event, so scroll again once it's up
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (notesFocused.current) scrollToNotes()
    })
    return () => subscription.remove()
  }, [])

  const copy = COPY[type]
  const isProfessor = type === 'professor'
  const stageOptions = isEditing ? STAGES_BY_TYPE[type] : START_STAGES[type]
  // Any stage past "draft" means the email went out, so it has a sent date
  const emailSent = isProfessor && stage !== 'draft'
  const now = dayjs()
  // Without a deadline, reminders are only limited by the current time
  const deadlineDay = hasDeadline ? dayjs(deadline) : null
  // The reminder chips, all ruled by lib/reminders. The presets follow the deadline: a far one offers
  // 1 week / 3 days / on the day, a close one just 1 hour. Without a deadline there's nothing to count
  // back from, so only custom times are offered
  const reminderChoices = { presetKeys, customTimes, alarmKeys }
  const presets = deadlineDay ? getReminderPresets(deadlineDay, now) : []
  const pickedReminders = listPickedReminders(reminderChoices, presets)
  const draftError = customDraft ? getCustomTimeError(customDraft, deadlineDay, now) : ''

  const errors = {
    title: title.trim() ? '' : `Enter the ${copy.title.toLowerCase()}`,
    organization: organization.trim() ? '' : `Enter the ${copy.org.split(' ')[0].toLowerCase()}`,
    contactEmail: !isProfessor || contactEmail.trim().includes('@') ? '' : 'Enter a valid email address',
    reminders: getCustomTimesError(customTimes, deadlineDay, now),
  }
  const isValid = !errors.title && !errors.organization && !errors.contactEmail && !errors.reminders

  const changeType = (next: ApplicationType) => {
    setType(next)
    setStage(START_STAGES[next][0])
    setShowErrors(false)
  }

  // Only fills what the circular states, so anything already typed stays unless the AI found a value;
  // the summary is added to the notes rather than replacing them
  const applyCircular = (fields: CircularFields) => {
    changeType(fields.type)
    if (fields.title) setTitle(fields.title)
    if (fields.organization) setOrganization(fields.organization)
    if (fields.link) setLink(fields.link)
    if (fields.location) setLocation(fields.location)
    if (fields.country) setCountry(fields.country)
    if (fields.intake) setIntake(fields.intake)
    if (fields.contactEmail) setContactEmail(fields.contactEmail)
    if (fields.researchArea) setResearchArea(fields.researchArea)
    if (fields.deadline) {
      setHasDeadline(true)
      setDeadline(new Date(fields.deadline))
    }
    const summary = fields.summary
    if (summary) setNotes((current) => (current.trim() ? `${current.trim()}\n\n${summary}` : summary))
  }

  const readCircular = async () => {
    if (isReadingCircular) return
    setIsReadingCircular(true)
    setCircularError('')
    try {
      const { fields, headings } = await extractCircular(circularText)
      applyCircular(fields)
      setCircular({ text: circularText.trim(), headings })
      setCircularOpen(false)
    } catch (error) {
      setCircularError(error instanceof Error ? error.message : 'Could not read the circular')
    } finally {
      setIsReadingCircular(false)
    }
  }

  const togglePreset = (key: string) =>
    setPresetKeys((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]))

  const setAlarm = (key: string, on: boolean) => {
    // The first alarm is when exact-alarm / full-screen access matters, so ask then
    if (on && alarmKeys.length === 0) ensureAlarmPermissions()
    setAlarmKeys((current) => (on ? [...current.filter((k) => k !== key), key] : current.filter((k) => k !== key)))
  }

  // Opens the time picker at a sensible starting time
  const startCustom = () => setCustomDraft(suggestCustomTime(deadlineDay, now))

  const addCustom = () => {
    if (!customDraft || draftError) return
    setCustomTimes((current) => [...current, customDraft].sort((a, b) => a.getTime() - b.getTime()))
    setCustomDraft(null)
  }

  // A new application gets every field; an edit only the ones this form changes, so the rest
  // (interview, documents, salary…) stays as it is
  const buildInput = (): ApplicationInput => {
    const common = {
      title: title.trim(),
      organization: organization.trim(),
      link: normalizeLink(link),
      notes: notes.trim() || undefined,
      deadline: hasDeadline ? deadline.toISOString() : null,
      reminders: choicesToReminders(reminderChoices, deadlineDay, now),
    }
    // The stage's dates and timeline, worked out the same way as the stage chips on the detail screen.
    // The follow-up nudge is automatic (see lib/notifications), so the reminders are only the user's own
    const moved = changeStage(application ?? { type }, stage, { sentAt: emailSent ? sentAt : undefined })

    if (moved.type === 'job') {
      const fields = { ...common, ...moved, location: location.trim() || undefined }
      return isEditing ? fields : { ...fields, interviewAt: null }
    }

    if (moved.type === 'university') {
      const fields = { ...common, ...moved, country: country.trim() || undefined, intake: intake.trim() || undefined }
      if (isEditing) return fields as ApplicationInput
      return { ...fields, documents: [] }
    }

    return {
      ...common,
      ...moved,
      contactEmail: contactEmail.trim(),
      emailSubject: emailSubject.trim() || undefined,
      researchArea: researchArea.trim() || undefined,
    }
  }

  const handleSave = async () => {
    if (isSaving) return
    if (!isValid) {
      setShowErrors(true)
      return
    }
    setIsSaving(true)
    try {
      // Only a new application gets the circular; an edit would otherwise clear the one already saved
      const input = buildInput()
      await onSave(!isEditing && circular ? { ...input, circular } : input)
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <Stack.Screen options={{ presentation: 'modal' }} />
      {/* Android draws edge-to-edge, so the window no longer shrinks for the keyboard on its own;
          padding the form on both platforms keeps the fields above it */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <View className="modal-header">
          <Text className="modal-title" accessibilityRole="header">{isEditing ? 'Edit application' : 'New application'}</Text>
          <Pressable className="modal-close" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
            <Text className="modal-close-text">✕</Text>
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} contentContainerClassName="gap-4 px-5 py-4" keyboardShouldPersistTaps="handled">
          {/* AI fills the form from a pasted circular; the user still checks everything and saves */}
          {!isEditing && !circularOpen && (
            <Pressable className="auth-secondary-button" onPress={() => setCircularOpen(true)} accessibilityRole="button">
              <Text className="auth-secondary-button-text">✨ Fill from a circular</Text>
            </Pressable>
          )}
          {circularOpen && (
            <Field label="Paste the circular" error={circularError}>
              <TextInput
                className="auth-input max-h-60"
                value={circularText}
                onChangeText={setCircularText}
                placeholder="Copy the whole job post, program page or professor profile and paste it here"
                placeholderTextColor={colors.mutedForeground}
                multiline
                textAlignVertical="top"
                maxLength={MAX_CIRCULAR_CHARS}
                editable={!isReadingCircular}
                autoFocus
              />
              <View className="flex-row gap-2">
                <Pressable
                  className="reminder-chip"
                  onPress={() => {
                    setCircularOpen(false)
                    setCircularError('')
                  }}
                  disabled={isReadingCircular}
                  accessibilityRole="button"
                >
                  <Text className="reminder-chip-text">Cancel</Text>
                </Pressable>
                <Pressable
                  className={clsx('reminder-chip reminder-chip-on flex-row items-center gap-2', (!circularText.trim() || isReadingCircular) && 'opacity-50')}
                  onPress={readCircular}
                  disabled={!circularText.trim() || isReadingCircular}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !circularText.trim() || isReadingCircular, busy: isReadingCircular }}
                >
                  {isReadingCircular && <ActivityIndicator size="small" color={colors.primary} />}
                  <Text className="reminder-chip-text">{isReadingCircular ? 'Reading…' : 'Fill form'}</Text>
                </Pressable>
              </View>
            </Field>
          )}
          {circular && !circularOpen && (
            <Text className="auth-helper">Filled from the circular by AI. Check every field, especially the deadline, before saving.</Text>
          )}

          {/* The type decides which fields exist, so it's fixed once the application is saved */}
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            {TYPES.map((option) => {
              const meta = TYPE_META[option]
              const isActive = type === option
              const isLocked = isEditing && !isActive
              return (
                <Pressable
                  key={option}
                  className={clsx('type-option', isActive && ['type-option-active', meta.chipClass], isLocked && 'opacity-40')}
                  onPress={() => changeType(option)}
                  disabled={isEditing}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive, disabled: isEditing }}
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
              {stageOptions.map((option) => (
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

          {emailSent && (
            <Field label="Email sent on">
              <DateTimeField label="Email sent on" value={sentAt} onChange={setSentAt} withTime={false} />
              <Text className="auth-helper">You&apos;ll be reminded to follow up after {FOLLOW_UP_DAYS} days.</Text>
            </Field>
          )}

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
            <Field label="Deadline">
              <DateTimeField label="Deadline" value={deadline} onChange={setDeadline} />
            </Field>
          )}

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
                  accessibilityLabel={`Remove reminder at ${formatReminderTime(time)}`}
                >
                  <Text className="reminder-chip-text">{formatReminderTime(time)}  ✕</Text>
                </Pressable>
              ))}
              {!customDraft && canAddCustomTime(deadlineDay, now) && (
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
            {pickedReminders.length > 0 && (
              <View className="mt-2.5 gap-2">
                {pickedReminders.map((item) => {
                  const isAlarm = alarmKeys.includes(item.key)
                  return (
                    <View key={item.key} className="flex-row items-center gap-2">
                      <Text className="auth-helper flex-1" numberOfLines={1}>{item.label}</Text>
                      <View className="flex-row gap-1.5" accessibilityRole="radiogroup">
                        <Pressable
                          className={clsx('reminder-chip', !isAlarm && 'reminder-chip-on')}
                          onPress={() => setAlarm(item.key, false)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: !isAlarm }}
                          accessibilityLabel={`${item.label}: notification only`}
                        >
                          <Text className="reminder-chip-text">Notification</Text>
                        </Pressable>
                        <Pressable
                          className={clsx('reminder-chip', isAlarm && 'reminder-chip-on')}
                          onPress={() => setAlarm(item.key, true)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isAlarm }}
                          accessibilityLabel={`${item.label}: notification and alarm`}
                        >
                          <Text className="reminder-chip-text">+ Alarm</Text>
                        </Pressable>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
            {hasDeadline && <Text className="auth-helper">You&apos;ll always be notified when the deadline passes.</Text>}
          </Field>

          <Field label="Notes">
            <TextInput
              // As tall as its text (one line when empty), up to about 10 lines, then it scrolls
              className="auth-input max-h-60"
              value={notes}
              onChangeText={setNotes}
              onFocus={() => {
                notesFocused.current = true
                scrollToNotes()
              }}
              onBlur={() => {
                notesFocused.current = false
              }}
              // Keeps the line being typed above the keyboard as the box grows
              onContentSizeChange={() => notesFocused.current && scrollToNotes()}
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
            <Text className="auth-button-text">{isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Save application'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default ApplicationForm
