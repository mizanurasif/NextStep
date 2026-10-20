import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import clsx from 'clsx'
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getAuthErrorMessage } from "@/lib/auth-errors";
const SafeAreaView = styled(RNSafeAreaView)

const SignIn = () => {
  const router = useRouter()

  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSignIn = async () => {
    const email = emailAddress.trim()
    setEmailError(email.includes('@') ? '' : 'Enter a valid email address')
    setPasswordError(password ? '' : 'Enter your password')
    if (!email.includes('@') || !password) return

    setIsSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.replace('/')
    } catch (error) {
      const { field, message } = getAuthErrorMessage(error)
      if (field === 'email') setEmailError(message)
      else setPasswordError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

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
            <Text className="auth-title">Welcome back</Text>
            <Text className="auth-subtitle">Sign in to keep track of your subscriptions</Text>
          </View>

          <View className="auth-card">
            <View className="auth-form">
              <View className="auth-field">
                <Text className="auth-label">Email</Text>
                <TextInput
                  className={clsx('auth-input', emailError && 'auth-input-error')}
                  value={emailAddress}
                  onChangeText={setEmailAddress}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                />
                {emailError ? <Text className="auth-error">{emailError}</Text> : null}
              </View>
              <View className="auth-field">
                <Text className="auth-label">Password</Text>
                <TextInput
                  className={clsx('auth-input', passwordError && 'auth-input-error')}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  secureTextEntry
                  autoComplete="password"
                />
                {passwordError ? <Text className="auth-error">{passwordError}</Text> : null}
              </View>
              <Pressable
                className={clsx('auth-button', (isSubmitting || !emailAddress || !password) && 'auth-button-disabled')}
                disabled={isSubmitting || !emailAddress || !password}
                onPress={handleSignIn}
              >
                <Text className="auth-button-text">{isSubmitting ? 'Signing in…' : 'Sign in'}</Text>
              </Pressable>
            </View>
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
