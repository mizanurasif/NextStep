import { alarmDelivery, alarmsSupported } from "@/lib/alarms";
import { notificationDelivery } from "@/lib/notifications";
import { planReminders } from "@/lib/reminder-plan";

// Makes the phone's scheduled reminders match the applications exactly.
//
//   applications ──► planReminders (lib/reminder-plan)   decides what, when and how
//                       │
//                       ├─ plan.alarms        ──► alarmDelivery        (lib/alarms)
//                       └─ plan.notifications ──► notificationDelivery (lib/notifications)
//
// Called on every Firebase change (lib/use-reminder-notifications). Nothing is ever edited in
// place: each adapter cancels its old schedule and sets the new one, so deleting an application,
// applying, or signing out (an empty list) all just work by rebuilding.

// Runs one sync at a time, so quick back-to-back data changes can't schedule duplicates
let queue = Promise.resolve();

export const syncReminders = (applications: Application[]) => {
    queue = queue.then(async () => {
        const plan = planReminders(applications, { now: new Date(), alarmsSupported });

        // Each adapter on its own, so one failing (e.g. a missing alarm sound) can't stop the other
        await alarmDelivery.replaceAll(plan.alarms).catch((error) => console.warn("Could not schedule alarms", error));
        await notificationDelivery
            .replaceAll(plan.notifications)
            .catch((error) => console.warn("Could not schedule reminders", error));
    });
    return queue;
};
