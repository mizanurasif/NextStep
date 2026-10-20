import "@/global.css"
import { FlatList, Image, Pressable, ScrollView, Text, View } from "react-native";
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";
import dayjs from "dayjs";
import { useRouter } from "expo-router";
import { APPLICATIONS, USER } from "@/constants/data";
import { icons } from "@/constants/icons";
import { colors } from "@/constants/theme";
import { getAwaitingReplies, getDueSoon, getGreeting, getInitials, getWeekSummary } from "@/lib/applications";
import ListHeading from "@/components/ListHeading";
import DueSoonCard from "@/components/DueSoonCard";
import AwaitingReplyRow from "@/components/AwaitingReplyRow";

const SafeAreaView = styled(RNSafeAreaView);

export default function App() {
  const now = dayjs();
  const summary = getWeekSummary(APPLICATIONS, now);
  const dueSoon = getDueSoon(APPLICATIONS, now);
  const awaitingReplies = getAwaitingReplies(APPLICATIONS);
  const progress = summary.total ? summary.submitted / summary.total : 0;
  const router = useRouter();
  const openApplication = (id: string) => router.push({ pathname: "/application/[id]", params: { id } });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pt-5 pb-30" showsVerticalScrollIndicator={false}>
        <View className="home-header">
          <View className="home-user">
            <View className="home-avatar-initials">
              <Text className="home-avatar-text">{getInitials(USER.name)}</Text>
            </View>
            <View>
              <Text className="home-greeting">{getGreeting(now)}</Text>
              <Text className="home-name">{USER.name.split(" ")[0]}</Text>
            </View>
          </View>
          <View className="home-actions">
            <Pressable className="home-icon-button" accessibilityRole="button" accessibilityLabel="Notifications">
              <Image source={icons.bell} className="size-5" tintColor={colors.primary} />
              <View className="home-icon-dot" />
            </Pressable>
            <Pressable className="home-icon-button-primary" accessibilityRole="button" accessibilityLabel="Add application">
              <Image source={icons.plus} className="size-5" tintColor={colors.background} />
            </Pressable>
          </View>
        </View>

        <View className="home-summary-card">
          <Text className="home-summary-label">This week</Text>
          <View className="home-summary-row">
            <View>
              <Text className="home-summary-count">{summary.dueThisWeek}</Text>
              <Text className="home-summary-caption">
                {summary.dueThisWeek === 1 ? "deadline due" : "deadlines due"}
              </Text>
            </View>
            <View>
              <Text className="home-summary-meta">
                {summary.upcomingInterviews} {summary.upcomingInterviews === 1 ? "interview" : "interviews"}
              </Text>
              <Text className="home-summary-meta">{summary.awaitingReply} awaiting reply</Text>
            </View>
          </View>
          <View className="home-progress-track">
            <View className="home-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </View>
          <Text className="home-progress-text">
            {summary.submitted} of {summary.total} applications submitted
          </Text>
        </View>

        <ListHeading title="Due soon" />
        <FlatList
          data={dueSoon}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable onPress={() => openApplication(item.id)} accessibilityRole="button">
              <DueSoonCard application={item} now={now} />
            </Pressable>
          )}
          ListEmptyComponent={<Text className="home-empty-state">Nothing due soon</Text>}
        />

        <View className="list-head">
          <Text className="list-title">Awaiting reply</Text>
          <Text className="home-section-meta">{awaitingReplies.length} waiting</Text>
        </View>
        <View className="gap-2.5">
          {awaitingReplies.length > 0 ? (
            awaitingReplies.map((item) => (
              <Pressable key={item.id} onPress={() => openApplication(item.id)} accessibilityRole="button">
                <AwaitingReplyRow item={item} now={now} />
              </Pressable>
            ))
          ) : (
            <Text className="home-empty-state">Nothing waiting for a reply</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
