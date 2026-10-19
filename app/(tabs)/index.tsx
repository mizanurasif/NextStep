import "@/global.css"

import { Link } from "expo-router";
import { Text, View } from "react-native";
import {styled} from 'nativewind';
import { SafeAreaView as RNSafeAreaView} from "react-native-safe-area-context";
 
const SafeAreaView = styled(RNSafeAreaView);

export default function App() {
  return (
    <SafeAreaView className="flex-1 bg-background p-5"> 
        <Text className="text-7xl font-sans-extrabold">Home</Text>
        <Link href='/onboarding' className="mt-4 font-sens-bold rounded bg-primary text-white p-4"> Go to Onboarding</Link>
        <Link href='/(auth)/sign-in' className="mt-4 font-sens-bold rounded bg-primary text-white p-4"> sign-in</Link>
        <Link href='/(auth)/sign-up' className="mt-4 font-sens-bold rounded bg-primary text-white p-4"> sign-up</Link>
    </SafeAreaView>
  );
}