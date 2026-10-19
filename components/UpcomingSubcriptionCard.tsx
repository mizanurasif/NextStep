import { View, Text, Image } from 'react-native'
import React from 'react'
import { formatCurrency } from '@/lib/utils'

const UpcomingSubcriptionCard = ({ data }: { data: UpcomingSubscription }) => {
  return (
    <View className='upcoming-card'>
        <View className='upcoming-row'>
            <Image source = {data.icon} className='upcoming-icon'/>
            <View>
              <Text className='upcoming-price'>{formatCurrency(data.price, data.currency)}</Text>
              <Text className='upcoming-meta' numberOfLines={1}>{ data.daysLeft > 1 ? `${data.daysLeft} days left` : "Last day" }</Text>
            </View>
        </View>
        <Text className='upcoming-name' numberOfLines={1}>{data.name}</Text>
    </View>
  )
}

export default UpcomingSubcriptionCard