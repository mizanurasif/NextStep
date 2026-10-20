import { View, Text } from 'react-native'
import clsx from 'clsx'
import type { Dayjs } from 'dayjs'
import { TYPE_META, formatDaysLeft } from '@/lib/applications'

const DueSoonCard = ({ application, now }: { application: Application; now: Dayjs }) => {
  const meta = TYPE_META[application.type]

  return (
    <View className="due-card">
      <View className="due-card-top">
        <View className={clsx('type-chip', meta.chipClass)}>
          <Text className="type-chip-text">{meta.label}</Text>
        </View>
        {application.deadline && (
          <Text className="due-card-left">{formatDaysLeft(application.deadline, now)}</Text>
        )}
      </View>
      <Text className="due-card-title" numberOfLines={2}>{application.title}</Text>
      <Text className="due-card-org" numberOfLines={1}>{application.organization}</Text>
    </View>
  )
}

export default DueSoonCard
