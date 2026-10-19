import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useSignUp } from '@clerk/expo'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import clsx from 'clsx'

const SafeAreaView = styled(RNSafeAreaView)

const SignUp = () => {
  const { signUp, errors, fetchStatus } = useSignUp()
  const router = useRouter()

  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needsCode, setNeedsCode] = useState(false)

  const isFetching = fetchStatus === 'fetching'

  const handleSignUp = async () => {
    const { error } = await signUp.password({ emailAddress: emailAddress.trim(), password })
    if (error) return

    const { error: sendError } = await signUp.verifications.sendEmailCode()
    if (!sendError) setNeedsCode(true)
  }

  const handleVerify = async () => {
    const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() })
    if (error) return

    if (signUp.status === 'complete') {
      await signUp.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return
          router.replace('/')
        },
      })
    }
  }

  const handleStartOver = async () => {
    await signUp.reset()
    setNeedsCode(false)
    setCode('')
  }

  const globalError = errors.global?.[0]?.message

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
            <Text className="auth-title">{needsCode ? 'Verify your email' : 'Create your account'}</Text>
            <Text className="auth-subtitle">
              {needsCode
                ? `We sent a verification code to ${emailAddress.trim()}`
                : 'Start tracking your subscriptions in one place'}
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
                <Pressable className="auth-secondary-button" disabled={isFetching} onPress={() => signUp.verifications.sendEmailCode()}>
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
                    className={clsx('auth-input', errors.fields.emailAddress && 'auth-input-error')}
                    value={emailAddress}
                    onChangeText={setEmailAddress}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                  />
                  {errors.fields.emailAddress && <Text className="auth-error">{errors.fields.emailAddress.message}</Text>}
                </View>
                <View className="auth-field">
                  <Text className="auth-label">Password</Text>
                  <TextInput
                    className={clsx('auth-input', errors.fields.password && 'auth-input-error')}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    secureTextEntry
                    autoComplete="new-password"
                  />
                  {errors.fields.password && <Text className="auth-error">{errors.fields.password.message}</Text>}
                </View>
                {globalError ? <Text className="auth-error">{globalError}</Text> : null}
                <Pressable
                  className={clsx('auth-button', (isFetching || !emailAddress || !password) && 'auth-button-disabled')}
                  disabled={isFetching || !emailAddress || !password}
                  onPress={handleSignUp}
                >
                  <Text className="auth-button-text">{isFetching ? 'Creating account…' : 'Create account'}</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View className="auth-link-row">
            <Text className="auth-link-copy">Already have an account?</Text>
            <Link href="/sign-in" replace>
              <Text className="auth-link">Sign in</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default SignUp
