import { Alert, Platform, ToastAndroid } from "react-native";

// A short message at the bottom of the screen. Android has native toasts; iOS doesn't, so it gets a
// plain alert instead
export const showToast = (message: string) => {
    if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.LONG);
    else Alert.alert(message);
};
