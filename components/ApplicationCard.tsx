import { View, Text, Image } from 'react-native'
import clsx from 'clsx'
import type { Dayjs } from 'dayjs'
import { colors } from '@/constants/theme'
import { icons } from '@/constants/icons'
import { STAGE_META, STAGE_TONE_CLASSES, TYPE_META, getCardDate } from '@/lib/applications'

const ApplicationCard = ({ application, now }: { application: Application; now: Dayjs }) => {
  const type = TYPE_META[application.type]
  const stage = STAGE_META[application.stage]
  const tone = STAGE_TONE_CLASSES[stage.tone]
  const date = getCardDate(application, now)

  return (
    <View className="app-card">
      <View className={clsx('app-card-icon', type.chipClass)}>
        <Image source={type.icon} className="size-5" tintColor={colors.primary} />
      </View>
      <View className="app-card-body">
        <Text className="app-card-title" numberOfLines={1}>{application.title}</Text>
        <Text className="app-card-org" numberOfLines={1}>{application.organization}</Text>
        <View className="app-card-footer">
          <View className={clsx('stage-pill', tone.pill)}>
            <Text className={clsx('stage-pill-text', tone.text)}>{stage.label}</Text>
          </View>
          {date && (
            <View className="app-card-date">
              <Image
                source={icons.clock}
                className="size-3.5"
                tintColor={date.urgent ? colors.urgent : colors.mutedForeground}
              />
              <Text className={clsx('app-card-date-text', date.urgent && 'app-card-date-urgent')}>{date.label}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

export default ApplicationCard
