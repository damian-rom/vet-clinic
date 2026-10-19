-- CreateTable
CREATE TABLE "weekly_time_blocks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekday" INTEGER NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),
    "start_time" TEXT NOT NULL CHECK ("start_time" GLOB '[0-2][0-9]:[0-5][0-9]'),
    "end_time" TEXT NOT NULL CHECK ("end_time" GLOB '[0-2][0-9]:[0-5][0-9]'),
    "reason" TEXT,
    CHECK ("end_time" > "start_time")
);
