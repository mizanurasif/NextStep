import { useRef, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, Text, TextInput, View } from 'react-native'
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import clsx from 'clsx'
import { colors } from '@/constants/theme'
import { useAuth } from '@/lib/auth-context'
import { useApplications } from '@/lib/applications-store'
import { findApplication } from '@/lib/applications'
import { askQuestion, type AnswerSource } from '@/lib/ai'

const SafeAreaView = styled(RNSafeAreaView)

type Message = {
  id: string
  role: 'user' | 'model'
  text: string
  // The excerpts this answer cites, shown under it
  sources?: AnswerSource[]
  // Shown in the chat but never sent back to the AI as history
  isError?: boolean
}

const SUGGESTIONS = {
  all: ['Which applications close this month?', 'Which jobs need React Native?', 'What should I prepare for my interviews?'],
  one: ['Summarize the requirements', 'What documents do I need?', 'What might they ask in the interview?'],
}

// "[2]" and "[1, 3]" both count as citations
const citedNumbers = (answer: string) =>
  new Set([...answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap((match) => match[1].split(',').map(Number)))

// Chat over the user's own applications (RAG): answers come from their saved circulars and notes.
// Opened with `applicationId`, it only searches that one application
const Ask = () => {
  const router = useRouter()
  const { applicationId } = useLocalSearchParams<{ applicationId?: string }>()
  const { user, initializing } = useAuth()
  const { applications } = useApplications()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const listRef = useRef<FlatList<Message>>(null)

  if (initializing) return null
  if (!user) return <Redirect href="/sign-in" />

  const scoped = applicationId ? findApplication(applications, applicationId) : undefined
  const add = (message: Omit<Message, 'id'>) =>
    setMessages((current) => [...current, { ...message, id: `${current.length}-${Date.now()}` }])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || isThinking) return
    const history = messages.filter((message) => !message.isError).map(({ role, text }) => ({ role, text }))
    add({ role: 'user', text: question })
    setDraft('')
    setIsThinking(true)
    try {
      const { answer, sources } = await askQuestion({ question, history, applications, applicationId: scoped?.id })
      const cited = citedNumbers(answer)
      add({ role: 'model', text: answer, sources: sources.filter((source) => cited.has(source.n)) })
    } catch (error) {
      add({ role: 'model', text: error instanceof Error ? error.message : 'Something went wrong', isError: true })
    } finally {
      setIsThinking(false)
    }
  }

  const openSource = (source: AnswerSource) => {
    if (source.applicationId && findApplication(applications, source.applicationId)) {
      router.push({ pathname: '/application/[id]', params: { id: source.applicationId } })
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <View className="modal-header">
          <View className="flex-1">
            <Text className="modal-title" accessibilityRole="header">Ask NextStep</Text>
            {scoped && <Text className="auth-helper" numberOfLines={1}>About {scoped.title} · {scoped.organization}</Text>}
          </View>
          <Pressable className="modal-close" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close">
            <Text className="modal-close-text">✕</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerClassName="grow gap-3 px-5 py-4"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View className="gap-3">
              <Text className="auth-helper">
                Answers come from the circulars and notes you&apos;ve saved, with the source for each point.
              </Text>
              <View className="reminder-row">
                {SUGGESTIONS[scoped ? 'one' : 'all'].map((suggestion) => (
                  <Pressable key={suggestion} className="reminder-chip" onPress={() => send(suggestion)} accessibilityRole="button">
                    <Text className="reminder-chip-text">{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View className={clsx('max-w-[88%] gap-2', item.role === 'user' ? 'self-end' : 'self-start')}>
              <View
                className={clsx(
                  'rounded-2xl px-4 py-3',
                  item.role === 'user' ? 'bg-accent' : 'border border-border bg-card',
                  item.isError && 'border-destructive',
                )}
              >
                <Text className={clsx('text-base font-sans-medium', item.isError ? 'text-destructive' : 'text-primary')} selectable>
                  {item.text}
                </Text>
              </View>
              {item.sources && item.sources.length > 0 && (
                <View className="flex-row flex-wrap gap-1.5">
                  {item.sources.map((source) => (
                    <Pressable
                      key={source.n}
                      className="rounded-full border border-border px-2.5 py-1"
                      onPress={() => openSource(source)}
                      accessibilityRole="link"
                      accessibilityLabel={`Source ${source.n}: ${source.label}, ${source.section ?? ''}`}
                    >
                      <Text className="text-xs font-sans-semibold text-muted-foreground" numberOfLines={1}>
                        [{source.n}] {source.label.split(': ').pop()} · {source.section}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
          ListFooterComponent={
            isThinking ? (
              <View className="flex-row items-center gap-2 self-start">
                <ActivityIndicator size="small" color={colors.primary} />
                <Text className="auth-helper">Searching your applications…</Text>
              </View>
            ) : null
          }
        />

        <View className="form-footer flex-row items-end gap-2">
          <TextInput
            className="auth-input max-h-32 flex-1"
            value={draft}
            onChangeText={setDraft}
            placeholder={scoped ? 'Ask about this application' : 'Ask about your applications'}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Pressable
            className={clsx('reminder-chip reminder-chip-on h-14', (!draft.trim() || isThinking) && 'opacity-50')}
            onPress={() => send(draft)}
            disabled={!draft.trim() || isThinking}
            accessibilityRole="button"
            accessibilityState={{ disabled: !draft.trim() || isThinking, busy: isThinking }}
          >
            <Text className="reminder-chip-text">Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default Ask
