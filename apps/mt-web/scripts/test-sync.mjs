import assert from "node:assert/strict";
import { fromSyncState, toSyncState } from "../src/lib/study-state.js";

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

console.log("test-sync: OK");
