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
import { DEFAULT_REMINDERS, FOLLOW_UP_DAYS, STAGE_META, TYPE_META, formatReminder } from '@/lib/applications'
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

const REMINDER_OPTIONS = [4320, 1440, 120, 0]

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
  const [reminders, setReminders] = useState<number[]>(DEFAULT_REMINDERS)
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
  const errors = {
    title: title.trim() ? '' : `Enter the ${copy.title.toLowerCase()}`,
    organization: organization.trim() ? '' : `Enter the ${copy.org.split(' ')[0].toLowerCase()}`,
    contactEmail: !isProfessor || contactEmail.trim().includes('@') ? '' : 'Enter a valid email address',
  }
  const isValid = !errors.title && !errors.organization && !errors.contactEmail

  const changeType = (next: ApplicationType) => {
    setType(next)
    setStage(START_STAGES[next][0])
    setShowErrors(false)
  }

  const toggleReminder = (minutes: number) =>
    setReminders((current) => (current.includes(minutes) ? current.filter((m) => m !== minutes) : [...current, minutes]))

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
        reminders: hasDeadline ? reminders.map((m, i) => ({ id: `r${i + 1}`, minutesBefore: m, enabled: true })) : [],
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
        reminders: hasDeadline ? reminders.map((m, i) => ({ id: `r${i + 1}`, minutesBefore: m, enabled: true })) : [],
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
                  <Field label="Remind me">
                    <View className="reminder-row">
                      {REMINDER_OPTIONS.map((minutes) => {
                        const isOn = reminders.includes(minutes)
                        return (
                          <Pressable
                            key={minutes}
                            className={clsx('reminder-chip', isOn && 'reminder-chip-on')}
                            onPress={() => toggleReminder(minutes)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isOn }}
                          >
                            <Text className="reminder-chip-text">{formatReminder(minutes)}</Text>
                          </Pressable>
                        )
                      })}
                    </View>
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
