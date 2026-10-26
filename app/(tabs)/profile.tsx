import { View, Text, Pressable, ScrollView } from 'react-native'
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { signOut } from "firebase/auth";
import clsx from 'clsx';
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useApplications } from '@/lib/applications-store';
import { FOLLOW_UP_DAYS, getInitials, getProfileStats } from '@/lib/applications';

const SafeAreaView = styled(RNSafeAreaView);
const StyledImage = styled(Image);

const PROVIDER_LABELS: Record<string, string> = {
  'google.com': 'Google',
  password: 'email and password',
};

const Profile = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { applications } = useApplications();
  const stats = getProfileStats(applications);

  const email = user?.email ?? '';
  // Email sign-ups have no display name, so fall back to the part before the @
  const name = user?.displayName || email.split('@')[0] || 'You';
  const providerId = user?.providerData[0]?.providerId ?? 'password';

  const statTiles = [
    { value: String(stats.jobsApplied), label: 'Jobs applied', chipClass: 'bg-job' },
    { value: String(stats.interviews), label: 'Interviews', chipClass: 'bg-university' },
    { value: `${stats.professorsReplied}/${stats.professorsEmailed}`, label: 'Prof replies', chipClass: 'bg-professor' },
  ];

  const settings = [
    { title: 'Deadline alert', detail: 'When a deadline passes', pill: 'Always' },
    { title: 'Follow-up nudge', detail: 'When a professor has not replied', pill: `${FOLLOW_UP_DAYS} days` },
    { title: 'Account', detail: `Signed in with ${PROVIDER_LABELS[providerId] ?? providerId}`, pill: 'Firebase' },
  ];

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/sign-in');
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pt-5 pb-30" showsVerticalScrollIndicator={false}>
        <Text className="apps-title">Profile</Text>

        <View className="profile-hero">
          <View className="profile-avatar">
            {user?.photoURL ? (
              <StyledImage source={{ uri: user.photoURL }} className="size-full" contentFit="cover" accessibilityLabel="Profile photo" />
            ) : (
              <Text className="profile-avatar-text">{getInitials(name)}</Text>
            )}
          </View>
          <Text className="profile-name">{name}</Text>
          {!!email && <Text className="profile-email">{email}</Text>}
        </View>

        <View className="profile-stats">
          {statTiles.map((tile) => (
            <View key={tile.label} className={clsx('profile-stat', tile.chipClass)}>
              <Text className="profile-stat-value">{tile.value}</Text>
              <Text className="profile-stat-label">{tile.label}</Text>
            </View>
          ))}
        </View>

        <View className="settings-card">
          {settings.map((row, index) => (
            <View key={row.title} className={clsx('settings-row', index < settings.length - 1 && 'settings-row-divider')}>
              <View className="settings-copy">
                <Text className="settings-title">{row.title}</Text>
                <Text className="settings-detail">{row.detail}</Text>
              </View>
              <View className="settings-pill">
                <Text className="settings-pill-text">{row.pill}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable className="sign-out-button" onPress={handleSignOut} accessibilityRole="button">
          <Text className="sign-out-text">Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

export default Profile
