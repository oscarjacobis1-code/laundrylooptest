import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculate,
  easeOutCirc,
  pickupEstimate,
  stageProgress,
  stageBudget,
  HOUR,
  MINUTE
} from "../math.js";

const createdAt = "2026-09-23T13:00:00.000Z";
const created = Date.parse(createdAt);

test("circular easing moves quickly then slows", () => {
  assert.equal(easeOutCirc(0), 0);
  assert.ok(easeOutCirc(.25) > .65 && easeOutCirc(.25) < .67);
  assert.ok(easeOutCirc(.5) > .86 && easeOutCirc(.5) < .87);
  assert.equal(easeOutCirc(1), 1);
});

test("regular Received progresses visibly but never reaches Washing", () => {
  assert.equal(stageProgress("Received", created, created + 5 * MINUTE, false), 6);
  assert.equal(stageProgress("Received", created, created + 30 * MINUTE, false), 16);
  assert.equal(stageProgress("Received", created, created + 60 * MINUTE, false), 22);
  assert.equal(stageProgress("Received", created, created + 2 * HOUR, false), 29);
  assert.equal(stageProgress("Received", created, created + 20 * HOUR, false), 34);
});

test("staff status is a hard boundary", () => {
  const received = calculate({
    tracking_code: "TEST",
    status: "Received",
    created_at: createdAt,
    status_changed_at: createdAt,
    express: false
  }, created + 30 * HOUR);
  assert.equal(received.progress, 34);
  assert.equal(received.displayStage, "Processing");

  const washingStart = created + 4 * HOUR;
  const washing = calculate({
    tracking_code: "TEST",
    status: "Washing",
    created_at: createdAt,
    status_changed_at: new Date(washingStart).toISOString(),
    express: false
  }, washingStart);
  assert.equal(washing.progress, 35);
  assert.equal(washing.displayStage, "Washing");

  const washingLate = calculate({
    tracking_code: "TEST",
    status: "Washing",
    created_at: createdAt,
    status_changed_at: new Date(washingStart).toISOString(),
    express: false
  }, washingStart + 10 * HOUR);
  assert.equal(washingLate.progress, 69);
});

test("Drying cannot become Ready without staff", () => {
  const start = created + 8 * HOUR;
  const result = calculate({
    tracking_code: "TEST",
    status: "Drying",
    created_at: createdAt,
    status_changed_at: new Date(start).toISOString(),
    express: false
  }, start + 12 * HOUR);
  assert.equal(result.progress, 99);
  assert.equal(result.displayStage, "Drying");
});

test("Ready is exactly 100", () => {
  const result = calculate({
    tracking_code: "TEST",
    status: "Ready for Pick-Up",
    created_at: createdAt,
    status_changed_at: createdAt,
    express: false
  }, created + HOUR);
  assert.equal(result.progress, 100);
  assert.equal(result.displayStage, "Ready for Pick-Up");
});

test("pickup ETA is separate from gauge stage budgets", () => {
  assert.equal(stageBudget("Received", false), 4 * HOUR);
  assert.equal(pickupEstimate(createdAt, false).getTime(), created + 48 * HOUR);

  assert.equal(stageBudget("Received", true), HOUR);
  assert.equal(pickupEstimate("2026-09-23T15:59:00Z", true).toISOString(), "2026-09-23T22:00:00.000Z");
  assert.equal(pickupEstimate("2026-09-23T16:00:00Z", true).toISOString(), "2026-09-24T14:00:00.000Z");
});


test("tracker dial keeps equal visual segments and 50/50 lookup controls", async () => {
  const [html, css, tracker] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../tracker.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /gauge-segmented/);
  assert.match(html, /stroke-dasharray="4 1"/);
  assert.match(html, /gauge-progress-mask/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(tracker, /gauge-progress-mask/);
});
