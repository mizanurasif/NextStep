import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { styled } from 'nativewind'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import clsx from 'clsx'
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { saveUserProfile } from "@/lib/database";
const SafeAreaView = styled(RNSafeAreaView)

const MIN_PASSWORD_LENGTH = 6

const SignUp = () => {
  const router = useRouter()

  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSignUp = async () => {
    const email = emailAddress.trim()
    const isEmailValid = email.includes('@')
    const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH
    setEmailError(isEmailValid ? '' : 'Enter a valid email address')
    setPasswordError(isPasswordValid ? '' : `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    if (!isEmailValid || !isPasswordValid) return

    setIsSubmitting(true)
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password)
      await saveUserProfile(user)
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
            <Text className="auth-title">Create your account</Text>
            <Text className="auth-subtitle">Start tracking your subscriptions in one place</Text>
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
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  secureTextEntry
                  autoComplete="new-password"
                />
                {passwordError ? <Text className="auth-error">{passwordError}</Text> : null}
              </View>
              <Pressable
                className={clsx('auth-button', (isSubmitting || !emailAddress || !password) && 'auth-button-disabled')}
                disabled={isSubmitting || !emailAddress || !password}
                onPress={handleSignUp}
              >
                <Text className="auth-button-text">{isSubmitting ? 'Creating account…' : 'Create account'}</Text>
              </Pressable>
            </View>
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
