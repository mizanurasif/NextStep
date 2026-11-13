import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import clsx from 'clsx'
import { colors } from '@/constants/theme'
import { useAiAccess } from '@/lib/ai/access'
import { PROVIDERS, type AiProvider } from '@/lib/ai/providers'
import { FREE_FILLS_PER_DAY } from '@/lib/ai/gemini'
import { showToast } from '@/lib/toast'

const PROVIDER_OPTIONS: AiProvider[] = ['openai', 'claude']

// The Profile tab's AI section: the user adds or removes their own OpenAI or Claude key. It only
// edits the setting; what the key unlocks is decided in lib/ai/access.tsx
const AiKeySettings = () => {
  const { aiKey, loading, saveAiKey, removeAiKey, freeFillsLeft } = useAiAccess()
  const [provider, setProvider] = useState<AiProvider>('openai')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (loading) return null

  const save = async () => {
    const apiKey = draft.trim()
    // Catches the common mix-up of pasting one company's key under the other
    if (!PROVIDERS[provider].isKeyShaped(apiKey)) {
      setError(`That doesn't look like a key from ${PROVIDERS[provider].label} (it starts with ${PROVIDERS[provider].keyHint})`)
      return
    }
    setIsSaving(true)
    try {
      await saveAiKey({ provider, apiKey })
      setDraft('')
      setError('')
      showToast(`${PROVIDERS[provider].label} key saved. All AI features are on`)
    } catch {
      setError('Could not save the key on this phone. Please try again')
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async () => {
    try {
      await removeAiKey()
      showToast('Key removed. Ask NextStep is off')
    } catch {
      showToast('Could not remove the key. Please try again')
    }
  }

  return (
    <View className="settings-card gap-3 p-4">
      <View className="settings-copy">
        <Text className="settings-title">AI</Text>
        <Text className="settings-detail">
          {aiKey
            ? `Using your ${PROVIDERS[aiKey.provider].label} key (…${aiKey.apiKey.slice(-4)}) for Ask NextStep and filling forms.`
            : `Add an OpenAI or Claude API key to use Ask NextStep. Without one you get ${FREE_FILLS_PER_DAY} free form fills a day${freeFillsLeft !== null ? ` (${freeFillsLeft} left today)` : ''}.`}
        </Text>
        <Text className="settings-detail">The key stays on this phone in encrypted storage, and AI use is billed to your account.</Text>
      </View>

      {aiKey ? (
        <Pressable className="reminder-chip self-start" onPress={remove} accessibilityRole="button">
          <Text className="reminder-chip-text">Remove key</Text>
        </Pressable>
      ) : (
        <>
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            {PROVIDER_OPTIONS.map((option) => (
              <Pressable
                key={option}
                className={clsx('reminder-chip', provider === option && 'reminder-chip-on')}
                onPress={() => {
                  setProvider(option)
                  setError('')
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: provider === option }}
              >
                <Text className="reminder-chip-text">{PROVIDERS[option].label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            className={clsx('auth-input', error && 'auth-input-error')}
            value={draft}
            onChangeText={(text) => {
              setDraft(text)
              setError('')
            }}
            placeholder={`${PROVIDERS[provider].label} API key (${PROVIDERS[provider].keyHint})`}
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!error && <Text className="auth-error">{error}</Text>}
          <Pressable
            className={clsx('auth-button', (!draft.trim() || isSaving) && 'auth-button-disabled')}
            onPress={save}
            disabled={!draft.trim() || isSaving}
            accessibilityRole="button"
            accessibilityState={{ disabled: !draft.trim() || isSaving, busy: isSaving }}
          >
            <Text className="auth-button-text">{isSaving ? 'Saving…' : 'Save key'}</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

export default AiKeySettings
