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
import { useAiAccess } from '@/lib/ai/access'
import { createResearchChat, readableAnswer, type ResearchSource } from '@/lib/ai/research/research'
import { showToast } from '@/lib/toast'

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

// Room for a long question or a pasted paragraph (about 500 tokens); every question is sent again with
// the next few, so it's still capped to keep the cost of a chat predictable
const MAX_QUESTION_CHARS = 2000

// The chips shown before the first question, one per thing the agent can do on the user's tracker.
// A complete question is sent straight away; one that needs details (which application, what note,
// when) is put in the text box for the user to finish
type Suggestion = { label: string; prompt: string; sendNow: boolean }

const SUGGESTIONS: Record<'all' | 'scoped', Suggestion[]> = {
  all: [
    { label: "What's due this week?", prompt: "What's due this week?", sendNow: true },
    { label: 'Add a note', prompt: 'Add a note to ', sendNow: false },
    { label: 'Set a notification or alarm', prompt: 'Remind me about ', sendNow: false },
  ],
  // Opened from one application, so "this" is clear
  scoped: [
    { label: "What's coming up for this?", prompt: "What's coming up for this application?", sendNow: true },
    { label: 'Add a note', prompt: 'Add a note: ', sendNow: false },
    { label: 'Set a notification or alarm', prompt: 'Remind me ', sendNow: false },
  ],
}

// Chat with the research agent: it reads the user's saved applications and searches the web, using the
// user's own OpenAI or Claude key (see lib/ai/research). Opened with `applicationId`, the chat starts
// from that application
const Ask = () => {
  const router = useRouter()
  const { applicationId } = useLocalSearchParams<{ applicationId?: string }>()
  const { user, initializing } = useAuth()
  const { applications, addApplication, updateApplication } = useApplications()
  const { research, askResearch } = useAiAccess()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const listRef = useRef<FlatList<Message>>(null)
  const inputRef = useRef<TextInput>(null)
  // The research chat; it remembers the earlier questions and answers itself
  const [chat, setChat] = useState(createResearchChat)
  // Numbers each question and answer, for their list keys
  const turnCount = useRef(0)

  if (initializing) return null
  if (!user) return <Redirect href="/sign-in" />

  const scoped = applicationId ? findApplication(applications, applicationId) : undefined
  const updateMessage = (id: string, change: (message: Message) => Partial<Message>) =>
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...change(message) } : message)))

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || isThinking) return
    // The buttons that open this screen are off without a key, but the key may have been removed since
    if (!research.allowed) return showToast(research.reason)
    const turn = ++turnCount.current
    const answerId = `answer-${turn}`
    setMessages((current) => [
      ...current,
      { id: `question-${turn}`, role: 'user', text: question },
      { id: answerId, role: 'model', text: '', status: 'Thinking…' },
    ])
    setDraft('')
    setIsThinking(true)
    try {
      await askResearch(
        chat,
        {
          question,
          applications,
          // The agent can add an application, a note or a reminder when asked, through the same store as the screens
          writes: { addApplication, updateApplication },
          application: scoped,
        },
        (event) => {
          switch (event.type) {
            case 'status':
              return updateMessage(answerId, () => ({ status: event.text }))
            case 'text':
              return updateMessage(answerId, (message) => ({ text: message.text + event.delta, status: undefined }))
            case 'sources':
              return updateMessage(answerId, () => ({ sources: event.sources }))
          }
        },
      )
    } catch (error) {
      // A failed question isn't remembered, so asking it again starts clean.
      // Any part of the answer already shown stays, with the error under it
      const reason = error instanceof Error ? error.message : 'Something went wrong'
      updateMessage(answerId, (message) => ({
        text: message.text ? `${message.text}\n\n${reason}` : reason,
        status: undefined,
        isError: true,
      }))
    } finally {
      setIsThinking(false)
    }
  }

  // Puts the start of a question in the text box and opens the keyboard, for the user to finish
  const startDraft = (prompt: string) => {
    setDraft(prompt)
    inputRef.current?.focus()
  }

  // Forgets the earlier questions, so the next one starts fresh
  const newChat = () => {
    setChat(createResearchChat())
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
                {research.allowed
                  ? "Ask what's due, save notes, set notifications and alarms, add applications, or research interview questions, professors and admissions on the web. Every answer lists its sources."
                  : research.reason}
              </Text>
              <View className="reminder-row">
                {SUGGESTIONS[scoped ? 'scoped' : 'all'].map((suggestion) => (
                  <Pressable
                    key={suggestion.label}
                    className="reminder-chip"
                    onPress={() => (suggestion.sendNow ? send(suggestion.prompt) : startDraft(suggestion.prompt))}
                    accessibilityRole="button"
                  >
                    <Text className="reminder-chip-text">{suggestion.label}</Text>
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
            ref={inputRef}
            className="auth-input max-h-32 flex-1"
            value={draft}
            onChangeText={setDraft}
            placeholder={scoped ? 'Ask about this application' : 'Ask or research anything'}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={MAX_QUESTION_CHARS}
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
