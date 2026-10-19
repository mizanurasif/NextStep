import { View, Text } from 'react-native'
import React from 'react'
import { Link, useLocalSearchParams } from 'expo-router'

const SuscriptionDetails = () => {
    const {id} = useLocalSearchParams<{id:string}>()
  return (
    <View>
      <Text>Suscription Details: {id}</Text>
        <Link href='/'>Go Back</Link>
    </View>
  )
}

export default SuscriptionDetails