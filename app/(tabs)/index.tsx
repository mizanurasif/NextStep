import "@/global.css"
import { FlatList, Image, Text, View } from "react-native";
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";
import images from "@/constants/images";
import { HOME_BALANCE, HOME_SUBSCRIPTIONS, HOME_USER, UPCOMING_SUBSCRIPTIONS } from "@/constants/data";
import { icons } from "@/constants/icons";
import { formatCurrency } from "@/lib/utils";
import dayjs from "dayjs";
import ListHeading from "@/components/ListHeading";
import UpcomingSubcriptionCard from "@/components/UpcomingSubcriptionCard";
import SubscriptionCard from "@/components/SubscriptionCard";
import { useState } from "react";

const SafeAreaView = styled(RNSafeAreaView);

export default function App() {
  const [expendedSubcriptionId, setExpendedSubcriptionId] = useState<string|null>(null);
  return (
    <SafeAreaView className="flex-1 bg-background p-5">
        <View>
          <FlatList
            ListHeaderComponent={() => (
              <>
                <View className="home-header">
                  <View className="home-user">
                      <Image source={images.avatar} className="home-avatar"/>
                      <Text className="home-user-name">{HOME_USER.name}</Text>
                  </View>
                  <Image source={icons.add} className="home-add-icon"/>
                </View>
                <View className="home-balance-card">
                  <Text className="home-balance-label">Balance</Text>
                  <View className="home-balance-row">
                    <Text className="home-balance-amount">{formatCurrency(HOME_BALANCE.amount)}</Text>
                    <Text className="home-balance-date">{dayjs(HOME_BALANCE.nextRenewalDate).format('MM/DD')}</Text>
                  </View>
                </View>
                <View className="mb-5">
                  <ListHeading title="Upcoming" />
                  <FlatList
                    data={UPCOMING_SUBSCRIPTIONS}
                    keyExtractor={(item) => item.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    renderItem={({item})=>(
                      <UpcomingSubcriptionCard data = {item} />
                    )}
                    ListEmptyComponent={<Text className="home-empty-state">No Upcoming Renewal Yet</Text>}
                  />
                </View>

                <ListHeading title="All Subscriptions" />
              </>
            )}
            data={HOME_SUBSCRIPTIONS}
            keyExtractor={(item) => item.id}
            renderItem={({item})=>(
                <SubscriptionCard {...item}
                expanded = {expendedSubcriptionId === item.id}
                onPress={()=> setExpendedSubcriptionId( (currentId) => (currentId === item.id ? null: item.id ))}
                />
                )}
            extraData={expendedSubcriptionId}
            ItemSeparatorComponent={() => <View className="h-4"/>}
            showsVerticalScrollIndicator = {false}
            ListEmptyComponent={<Text className="home-empty-state">No Subscription Yet</Text>}
            contentContainerClassName="pb-20"
          />
        </View>
    </SafeAreaView>
  );
}