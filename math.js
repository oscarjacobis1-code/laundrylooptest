export const HOUR = 3600000;
export const MINUTE = 60000;

export const anchors = {
  "Received": 0,
  "Washing": 35,
  "Drying": 70,
  "Ready for Pick-Up": 100,
  "Picked Up (Archived)": 100,
};

export const ceilings = {
  "Received": 34,
  "Washing": 69,
  "Drying": 99,
};

export const regularBudgets = {
  "Received": 4 * HOUR,
  "Washing": 2 * HOUR,
  "Drying": 2 * HOUR,
};

export const expressBudgets = {
  "Received": 1 * HOUR,
  "Washing": 1.5 * HOUR,
  "Drying": 1.5 * HOUR,
};

export const visualStages = ["Received", "Processing", "Washing", "Drying", "Ready for Pick-Up"];

export function easeOutCirc(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return Math.sqrt(1 - Math.pow(x - 1, 2));
}

export function pickupEstimate(createdAt, express) {
  const received = new Date(createdAt);
  if (!Number.isFinite(received.getTime())) return null;
  if (!express) return new Date(received.getTime() + 48 * HOUR);

  // Guyana is UTC-4 year-round.
  // Approved Express promise:
  // before noon -> 6 PM same day
  // at/after noon -> 10 AM next morning.
  const local = new Date(received.getTime() - 4 * HOUR);
  const beforeNoon = local.getUTCHours() < 12;
  local.setUTCHours(beforeNoon ? 18 : 10, 0, 0, 0);
  if (!beforeNoon) local.setUTCDate(local.getUTCDate() + 1);
  return new Date(local.getTime() + 4 * HOUR);
}

export function stageBudget(status, express) {
  return (express ? expressBudgets : regularBudgets)[status] ?? HOUR;
}

export function stageProgress(status, eventTime, now, express) {
  const base = anchors[status];
  const ceiling = ceilings[status];
  if (base == null || ceiling == null) return null;

  const elapsed = Math.max(0, now - eventTime);
  const t = Math.min(1, elapsed / stageBudget(status, express));
  const progress = base + Math.floor((ceiling - base) * easeOutCirc(t));
  return Math.max(base, Math.min(ceiling, progress));
}

export function displayStage(progress, staffStatus) {
  if (staffStatus === "Cancelled/Refunded") return "Cancelled/Refunded";
  if (staffStatus === "Picked Up (Archived)") return "Ready for Pick-Up";
  if (progress == null) return staffStatus || "Received";
  if (progress >= 100) return "Ready for Pick-Up";
  if (progress >= 70) return "Drying";
  if (progress >= 35) return "Washing";
  if (progress >= 15) return "Processing";
  return "Received";
}

export function calculate(row, now = Date.now()) {
  const status = row.status || "Received";
  const created = Date.parse(row.created_at);
  const changed = Date.parse(row.status_changed_at);
  const eventTime = Number.isFinite(changed) && changed >= created && changed <= now ? changed : created;
  const express = Boolean(row.express);
  const eta = pickupEstimate(row.created_at, express);

  if (status === "Cancelled/Refunded") {
    return { status, progress: null, displayStage: status, eventTime, eta: null, express };
  }
  if (status === "Ready for Pick-Up" || status === "Picked Up (Archived)") {
    return { status, progress: 100, displayStage: "Ready for Pick-Up", eventTime, eta, express };
  }

  const progress = stageProgress(status, eventTime, now, express);
  return { status, progress, displayStage: displayStage(progress, status), eventTime, eta, express };
}
