import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useSignIn } from '@clerk/expo'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import clsx from 'clsx'

const SafeAreaView = styled(RNSafeAreaView)

const SignIn = () => {
  const { signIn, errors, fetchStatus } = useSignIn()
  const router = useRouter()

  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needsCode, setNeedsCode] = useState(false)
  const [message, setMessage] = useState('')

  const isFetching = fetchStatus === 'fetching'

  const finishSignIn = async () => {
    await signIn.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) return
        router.replace('/')
      },
    })
  }

  const handleSignIn = async () => {
    setMessage('')
    const { error } = await signIn.password({ identifier: emailAddress.trim(), password })
    if (error) return

    if (signIn.status === 'complete') {
      await finishSignIn()
    } else if (signIn.status === 'needs_client_trust') {
      // New device: Clerk asks for a code sent to the user's email
      const { error: sendError } = await signIn.mfa.sendEmailCode()
      if (!sendError) setNeedsCode(true)
    } else {
      setMessage('This account needs an extra sign-in step that is not supported yet.')
    }
  }

  const handleVerify = async () => {
    const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() })
    if (error) return
    if (signIn.status === 'complete') await finishSignIn()
  }

  const handleStartOver = async () => {
    await signIn.reset()
    setNeedsCode(false)
    setCode('')
  }

  const globalError = errors.global?.[0]?.message || message

  return (
    <SafeAreaView className="auth-safe-area">
      <KeyboardAvoidingView className="auth-screen" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="auth-scroll" contentContainerClassName="auth-content" keyboardShouldPersistTaps="handled">
          <View className="auth-brand-block">
            <View className="auth-logo-wrap">
              <View className="auth-logo-mark">
                <Text className="auth-logo-mark-text">S</Text>
              </View>
              <View>
                <Text className="auth-wordmark">Subscription</Text>
                <Text className="auth-wordmark-sub">Track every renewal</Text>
              </View>
            </View>
            <Text className="auth-title">{needsCode ? 'Check your email' : 'Welcome back'}</Text>
            <Text className="auth-subtitle">
              {needsCode
                ? `We sent a verification code to ${emailAddress.trim()}`
                : 'Sign in to keep track of your subscriptions'}
            </Text>
          </View>

          <View className="auth-card">
            {needsCode ? (
              <View className="auth-form">
                <View className="auth-field">
                  <Text className="auth-label">Verification code</Text>
                  <TextInput
                    className={clsx('auth-input', errors.fields.code && 'auth-input-error')}
                    value={code}
                    onChangeText={setCode}
                    placeholder="Enter the 6-digit code"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                  />
                  {errors.fields.code && <Text className="auth-error">{errors.fields.code.message}</Text>}
                </View>
                {globalError ? <Text className="auth-error">{globalError}</Text> : null}
                <Pressable
                  className={clsx('auth-button', (isFetching || !code) && 'auth-button-disabled')}
                  disabled={isFetching || !code}
                  onPress={handleVerify}
                >
                  <Text className="auth-button-text">{isFetching ? 'Verifying…' : 'Verify'}</Text>
                </Pressable>
                <Pressable className="auth-secondary-button" disabled={isFetching} onPress={() => signIn.mfa.sendEmailCode()}>
                  <Text className="auth-secondary-button-text">Send a new code</Text>
                </Pressable>
                <Pressable className="auth-secondary-button" onPress={handleStartOver}>
                  <Text className="auth-secondary-button-text">Start over</Text>
                </Pressable>
              </View>
            ) : (
              <View className="auth-form">
                <View className="auth-field">
                  <Text className="auth-label">Email</Text>
                  <TextInput
                    className={clsx('auth-input', errors.fields.identifier && 'auth-input-error')}
                    value={emailAddress}
                    onChangeText={setEmailAddress}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                  />
                  {errors.fields.identifier && <Text className="auth-error">{errors.fields.identifier.message}</Text>}
                </View>
                <View className="auth-field">
                  <Text className="auth-label">Password</Text>
                  <TextInput
                    className={clsx('auth-input', errors.fields.password && 'auth-input-error')}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureTextEntry
                    autoComplete="password"
                  />
                  {errors.fields.password && <Text className="auth-error">{errors.fields.password.message}</Text>}
                </View>
                {globalError ? <Text className="auth-error">{globalError}</Text> : null}
                <Pressable
                  className={clsx('auth-button', (isFetching || !emailAddress || !password) && 'auth-button-disabled')}
                  disabled={isFetching || !emailAddress || !password}
                  onPress={handleSignIn}
                >
                  <Text className="auth-button-text">{isFetching ? 'Signing in…' : 'Sign in'}</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View className="auth-link-row">
            <Text className="auth-link-copy">Don&apos;t have an account?</Text>
            <Link href="/sign-up" replace>
              <Text className="auth-link">Create one</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default SignIn
