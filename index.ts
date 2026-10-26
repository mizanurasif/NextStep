import { registerAlarmBackgroundHandler } from "@/lib/alarms";

// Registered before the app starts, so an alarm's Stop / Snooze buttons work while the app is closed
registerAlarmBackgroundHandler();

// eslint-disable-next-line import/first
import "expo-router/entry";
