import { View, Text } from 'react-native'
import React from 'react'
import { Link } from 'expo-router'

const SignIn = () => {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-3xl font-bold text-primary">Sign In</Text>
      <Link href='/(auth)/sign-up' className="mt-4 text-accent">Don&apos;t have an account? Create one</Link>
    </View>
  )
}

export default SignIn
