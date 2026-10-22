import assert from "node:assert/strict";
import { fromSyncState, getStudyStats, toSyncState } from "../src/lib/study-state.js";

const webState = {
  attempts: {
    q1: { attempts: 2, correct: 1, lastCorrect: false, selected: ["B"], updatedAt: "2026-09-08T08:00:00Z" },
  },
  favorites: ["q1"],
  wrong: ["q1"],
  sessions: [],
  syncMeta: {},
};

const outbound = toSyncState(webState);
assert.deepEqual(outbound.favorites, ["q1"]);
assert.equal(outbound.answers.q1.attempts, 2);
assert.equal(outbound.wrongbook.q1.attempts, 2);
assert.equal(outbound.mastered.q1, true);
assert.equal(Object.hasOwn(outbound, "lastProgress"), false);

const inbound = fromSyncState({
  ...outbound,
  lastProgress: { currentId: "q1" },
  progressPositions: { all: { currentId: "q1" } },
  studyEvents: [{ id: "q1", correct: false }],
});
assert.deepEqual(inbound.wrong, ["q1"]);
assert.equal(inbound.attempts.q1.correct, 1);
assert.equal(inbound.syncMeta.lastProgress.currentId, "q1");

const roundTrip = toSyncState(inbound);
assert.equal(roundTrip.lastProgress.currentId, "q1");
assert.equal(roundTrip.studyEvents.length, 1);

const scopedState = {
  attempts: {
    current: { attempts: 2, correct: 2 },
    legacy: { attempts: 3, correct: 1 },
  },
  wrong: ["legacy"],
  favorites: ["current", "legacy"],
};
const scopedStats = getStudyStats(scopedState, [{ id: "current" }]);
assert.equal(scopedStats.practiced, 1);
assert.equal(scopedStats.totalAttempts, 2);
assert.equal(scopedStats.accuracy, 100);
assert.equal(scopedStats.wrong, 0);
assert.equal(scopedStats.favorites, 1);

console.log("test-sync: OK");
