import { View, Text } from 'react-native'
import React from 'react'
import { Link } from 'expo-router'

const SignUp = () => {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-3xl font-bold text-primary">Sign Up</Text>
      <Link href='/(auth)/sign-in' className="mt-4 text-accent">Already have an account? Sign in</Link>
    </View>
  )
}

export default SignUp
