import { View, Text, Pressable } from 'react-native'
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";
import { useRouter } from 'expo-router';
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
const SafeAreaView = styled(RNSafeAreaView);

const Profile = () => {
  const router = useRouter();
  const { user } = useAuth();

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/sign-in');
  }

  return (
    <SafeAreaView className="flex-1 bg-background p-5">
      <Text className="list-title">Profile</Text>
      <View className="auth-card">
        <Text className="auth-label">Signed in as</Text>
        <Text className="auth-helper">{user?.email ?? 'Not signed in'}</Text>
        <Pressable className="sub-cancel mt-5" onPress={handleSignOut}>
          <Text className="sub-cancel-text">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

export default Profile
