import { useRef, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, Text, TextInput, View } from 'react-native'
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import clsx from 'clsx'
import { colors } from '@/constants/theme'
import { useAuth } from '@/lib/auth-context'
import { useApplications } from '@/lib/applications-store'
import { findApplication } from '@/lib/applications'
import { readableAnswer, streamResearch, type ResearchHistory, type ResearchSource } from '@/lib/ai'

const SafeAreaView = styled(RNSafeAreaView)

type Message = {
  id: string
  role: 'user' | 'model'
  text: string
  // What the agent is doing, shown until its answer starts
  status?: string
  // The web pages and saved applications this answer used, shown under it
  sources?: ResearchSource[]
  isError?: boolean
}

const SUGGESTIONS: Record<ApplicationType | 'all', string[]> = {
  all: ['Which of my jobs need React Native?', 'Which applications close this month?', 'What do my interview companies usually ask?'],
  job: ['What did they ask in past interviews?', 'What do candidates say about the process?', 'Summarize the requirements'],
  university: ['Deadline, fee and fee waiver?', 'IELTS, TOEFL and GRE requirements?', 'What funding is there?'],
  professor: ['What are they researching now?', 'What are their recent papers?', 'Are they taking new students?'],
}

// Chat with the research agent: it reads the user's saved applications and searches the web.
// Opened with `applicationId`, the chat starts from that application
const Ask = () => {
  const router = useRouter()
  const { applicationId } = useLocalSearchParams<{ applicationId?: string }>()
  const { user, initializing } = useAuth()
  const { applications } = useApplications()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const listRef = useRef<FlatList<Message>>(null)
  // The chat so far, exactly as the server returned it; null until the first answer
  const history = useRef<ResearchHistory>(null)

  if (initializing) return null
  if (!user) return <Redirect href="/sign-in" />

  const scoped = applicationId ? findApplication(applications, applicationId) : undefined
  const updateMessage = (id: string, change: (message: Message) => Partial<Message>) =>
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...change(message) } : message)))

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || isThinking) return
    const now = Date.now()
    const answerId = `answer-${now}`
    setMessages((current) => [
      ...current,
      { id: `question-${now}`, role: 'user', text: question },
      { id: answerId, role: 'model', text: '', status: 'Thinking…' },
    ])
    setDraft('')
    setIsThinking(true)
    try {
      await streamResearch(
        // The application only goes with the first question; after that it's in the history
        { question, history: history.current, applicationId: history.current === null ? scoped?.id : undefined },
        (event) => {
          switch (event.type) {
            case 'status':
              return updateMessage(answerId, () => ({ status: event.text }))
            case 'text':
              return updateMessage(answerId, (message) => ({ text: message.text + event.delta, status: undefined }))
            case 'sources':
              return updateMessage(answerId, () => ({ sources: event.sources }))
            case 'done':
              if (event.history !== null) history.current = event.history
              return
            case 'error':
              // A failed question isn't added to the history, so asking it again starts clean
              return updateMessage(answerId, (message) => ({
                text: message.text ? `${message.text}\n\n${event.message}` : event.message,
                status: undefined,
                isError: true,
              }))
          }
        },
      )
    } catch (error) {
      updateMessage(answerId, () => ({
        text: error instanceof Error ? error.message : 'Something went wrong',
        status: undefined,
        isError: true,
      }))
    } finally {
      setIsThinking(false)
    }
  }

  // The history can't be shortened, so a long chat is started again instead
  const newChat = () => {
    history.current = null
    setMessages([])
  }

  const openSource = (source: ResearchSource) => {
    if (source.type === 'web') {
      WebBrowser.openBrowserAsync(source.url)
    } else if (findApplication(applications, source.id)) {
      router.push({ pathname: '/application/[id]', params: { id: source.id } })
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
          {messages.length > 0 && !isThinking && (
            <Pressable className="reminder-chip mr-2" onPress={newChat} accessibilityRole="button">
              <Text className="reminder-chip-text">New chat</Text>
            </Pressable>
          )}
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
                Ask about your saved applications, or research interview questions, professors and admissions on the web.
                Every answer lists its sources.
              </Text>
              <View className="reminder-row">
                {SUGGESTIONS[scoped?.type ?? 'all'].map((suggestion) => (
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
                {!item.text && item.status ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text className="auth-helper flex-shrink" numberOfLines={2}>{item.status}</Text>
                  </View>
                ) : (
                  <Text className={clsx('text-base font-sans-medium', item.isError ? 'text-destructive' : 'text-primary')} selectable>
                    {item.role === 'model' ? readableAnswer(item.text) : item.text}
                  </Text>
                )}
              </View>
              {item.sources && item.sources.length > 0 && (
                <View className="flex-row flex-wrap gap-1.5">
                  {item.sources.map((source) => (
                    <Pressable
                      key={source.type === 'web' ? source.url : source.id}
                      className="max-w-full rounded-full border border-border px-2.5 py-1"
                      onPress={() => openSource(source)}
                      accessibilityRole="link"
                      accessibilityLabel={`${source.type === 'web' ? 'Web page' : 'Your application'}: ${source.title}`}
                    >
                      <Text className="text-xs font-sans-semibold text-muted-foreground" numberOfLines={1}>
                        {source.type === 'web' ? '🌐' : '📄'} {source.title}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
        />

        <View className="form-footer flex-row items-end gap-2">
          <TextInput
            className="auth-input max-h-32 flex-1"
            value={draft}
            onChangeText={setDraft}
            placeholder={scoped ? 'Ask about this application' : 'Ask or research anything'}
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
