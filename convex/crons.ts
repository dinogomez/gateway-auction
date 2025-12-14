import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Attempt to create a new game every 2 hours
crons.interval(
  "auto-create-game",
  { hours: 2 },
  internal.scheduler.tryCreateScheduledGame,
);

// Sync credits every 30 minutes to keep balance up to date
crons.interval(
  "sync-credits",
  { minutes: 30 },
  internal.credits.syncCreditsInternal,
);

export default crons;
