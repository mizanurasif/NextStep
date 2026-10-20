import { useState } from 'react'
import { FlatList, Image, Pressable, Text, TextInput, View } from 'react-native'
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";
import { useRouter } from 'expo-router'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { APPLICATIONS } from '@/constants/data'
import { icons } from '@/constants/icons'
import { colors } from '@/constants/theme'
import {
  APPLICATION_FILTERS,
  getWeekSummary,
  matchesSearch,
  sortApplications,
  type ApplicationFilter,
} from '@/lib/applications'
import ApplicationCard from '@/components/ApplicationCard'

const SafeAreaView = styled(RNSafeAreaView);

const Applications = () => {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ApplicationFilter>('all')
  const router = useRouter()

  const now = dayjs()
  const summary = getWeekSummary(APPLICATIONS, now)
  const countFor = (key: ApplicationFilter) =>
    key === 'all' ? APPLICATIONS.length : APPLICATIONS.filter((a) => a.type === key).length

  const visible = sortApplications(
    APPLICATIONS.filter((a) => (filter === 'all' || a.type === filter) && matchesSearch(a, query)),
    now,
  )

  const emptyMessage = query.trim()
    ? `Nothing matches "${query.trim()}"`
    : 'No applications here yet'

  return (
    <SafeAreaView className="flex-1 bg-background mx-5 pt-5">
      <View className="apps-header mx-5">
        <View>
          <Text className="apps-title">Applications</Text>
          <Text className="apps-subtitle">
            {summary.total} tracked · {summary.dueThisWeek} due this week
          </Text>
        </View>
        <Pressable className="home-icon-button-primary" accessibilityRole="button" accessibilityLabel="Add application">
          <Image source={icons.plus} className="size-5" tintColor={colors.background} />
        </Pressable>
      </View>

      <View className="search-box mx-5">
        <Image source={icons.search} className="size-4.5" tintColor={colors.mutedForeground} />
        <TextInput
          className="search-input"
          value={query}
          onChangeText={setQuery}
          placeholder="Search role, company or professor"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel="Search applications"
        />
      </View>

      <View className="filter-row mx-5" accessibilityRole="tablist">
        {APPLICATION_FILTERS.map((option) => {
          const isActive = filter === option.key
          return (
            <Pressable
              key={option.key}
              className={clsx('filter-chip', isActive ? 'filter-chip-active' : option.chipClass)}
              onPress={() => setFilter(option.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text className={clsx('filter-chip-text', isActive && 'filter-chip-text-active')}>
                {option.label} {countFor(option.key)}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <FlatList
        className="mt-4.5 mx-5"
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/application/[id]', params: { id: item.id } })}
            accessibilityRole="button"
          >
            <ApplicationCard application={item} now={now} />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View className="h-2.5" />}
        ListEmptyComponent={<Text className="home-empty-state">{emptyMessage}</Text>}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="pb-30"
      />
    </SafeAreaView>
  )
}

export default Applications
