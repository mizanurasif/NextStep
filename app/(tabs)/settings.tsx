import { View, Text, Pressable } from 'react-native'
import React from 'react'
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";
import { useClerk, useUser } from '@clerk/expo';

const SafeAreaView = styled(RNSafeAreaView);

const Settings = () => {
  const { signOut } = useClerk();
  const { user } = useUser();

  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <Text className="list-title">Settings</Text>
      <View className="auth-card">
        <Text className="auth-label">Signed in as</Text>
        <Text className="auth-helper">{user?.primaryEmailAddress?.emailAddress}</Text>
        <Pressable className="sub-cancel mt-5" onPress={() => signOut()}>
          <Text className="sub-cancel-text">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

export default Settings
