import { icons } from "./icons";
import appData from "./data.json";

// JSON imports widen string unions to `string`, so the cast restores the
// exact types from type.d.ts (e.g. "job" instead of any string)
const APP_DATA = appData as AppData;

export const USER: UserProfile = APP_DATA.user;
export const APPLICATIONS: Application[] = APP_DATA.applications;

export const tabs: AppTab[] = [
    { name: "index", title: "Home", icon: icons.home },
    { name: "applications", title: "Applications", icon: icons.briefcase },
    { name: "calendar", title: "Calendar", icon: icons.calendar },
    { name: "profile", title: "Profile", icon: icons.profile },
];