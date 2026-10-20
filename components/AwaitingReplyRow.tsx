import { View, Text, Image } from 'react-native'
import clsx from 'clsx'
import dayjs, { type Dayjs } from 'dayjs'
import { colors } from '@/constants/theme'
import { TYPE_META, formatDaysAgo, getWaitingSince, needsFollowUp, type AwaitingReply } from '@/lib/applications'

// What the row says about where things stand, and whether it needs attention
const getStatus = (item: AwaitingReply, now: Dayjs) => {
  const since = getWaitingSince(item)

  if (item.type === 'job') {
    if (item.stage === 'interview') {
      return {
        pill: 'Interview',
        urgent: true,
        meta: item.interviewAt ? `Interview ${dayjs(item.interviewAt).format('MMM D, h:mm A')}` : 'Interview stage',
      }
    }
    return { pill: 'Applied', urgent: false, meta: since ? `Applied ${formatDaysAgo(since, now)}` : 'Applied' }
  }

  if (item.type === 'university') {
    return {
      pill: item.stage === 'under_review' ? 'Under review' : 'Submitted',
      urgent: false,
      meta: since ? `Submitted ${formatDaysAgo(since, now)}` : 'Submitted',
    }
  }

  const followUp = needsFollowUp(item, now)
  return {
    pill: followUp ? 'Follow up' : 'Waiting',
    urgent: followUp,
    meta: since ? `Sent ${formatDaysAgo(since, now)}` : 'Not sent yet',
  }
}

const AwaitingReplyRow = ({ item, now }: { item: AwaitingReply; now: Dayjs }) => {
  const meta = TYPE_META[item.type]
  const status = getStatus(item, now)
  // "Machine Learning Lab · University of Alberta" → "Machine Learning Lab"
  const organization = item.organization.split('·')[0].trim()

  return (
    <View className="reply-row">
      <View className={clsx('reply-icon', meta.chipClass)}>
        <Image source={meta.icon} className="size-5" tintColor={colors.primary} />
      </View>
      <View className="reply-copy">
        <Text className="reply-name" numberOfLines={1}>{item.title}</Text>
        <Text className="reply-meta" numberOfLines={1}>{status.meta} · {organization}</Text>
      </View>
      <View className={clsx('reply-pill', status.urgent && 'reply-pill-urgent')}>
        <Text className="reply-pill-text">{status.pill}</Text>
      </View>
    </View>
  )
}

export default AwaitingReplyRow
