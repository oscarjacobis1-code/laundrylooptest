const SUPABASE_URL = "https://coohutrnqcxjhkxprama.supabase.co";
const SUPABASE_KEY = "sb_publishable_WwvZpvMkiHM3YOLhwty85g_wGZKQ84e";

const HOUR = 3600000;
const MINUTE = 60000;

const anchors = {
  "Received": 0,
  "Washing": 35,
  "Drying": 70,
  "Ready for Pick-Up": 100,
  "Picked Up (Archived)": 100,
};
const ceilings = {
  "Received": 34,
  "Washing": 69,
  "Drying": 99,
};
const regularBudgets = {
  "Received": 4 * HOUR,
  "Washing": 2 * HOUR,
  "Drying": 2 * HOUR,
};
const expressBudgets = {
  "Received": 1 * HOUR,
  "Washing": 1.5 * HOUR,
  "Drying": 1.5 * HOUR,
};
const visualStages = ["Received", "Processing", "Washing", "Drying", "Ready for Pick-Up"];

const el = (id) => document.getElementById(id);

function easeOutCirc(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return Math.sqrt(1 - Math.pow(x - 1, 2));
}

function pickupEstimate(createdAt, express) {
  const received = new Date(createdAt);
  if (!Number.isFinite(received.getTime())) return null;
  if (!express) return new Date(received.getTime() + 48 * HOUR);

  const local = new Date(received.getTime() - 4 * HOUR);
  const beforeNoon = local.getUTCHours() < 12;
  local.setUTCHours(beforeNoon ? 18 : 10, 0, 0, 0);
  if (!beforeNoon) local.setUTCDate(local.getUTCDate() + 1);
  return new Date(local.getTime() + 4 * HOUR);
}

function stageBudget(status, express) {
  return (express ? expressBudgets : regularBudgets)[status] ?? HOUR;
}

function stageProgress(status, eventTime, now, express) {
  const base = anchors[status];
  const ceiling = ceilings[status];
  if (base == null || ceiling == null) return null;

  const elapsed = Math.max(0, now - eventTime);
  const t = Math.min(1, elapsed / stageBudget(status, express));
  const progress = base + Math.floor((ceiling - base) * easeOutCirc(t));
  return Math.max(base, Math.min(ceiling, progress));
}

function displayStage(progress, staffStatus) {
  if (staffStatus === "Cancelled/Refunded") return "Cancelled/Refunded";
  if (staffStatus === "Picked Up (Archived)") return "Ready for Pick-Up";
  if (progress == null) return staffStatus || "Received";
  if (progress >= 100) return "Ready for Pick-Up";
  if (progress >= 70) return "Drying";
  if (progress >= 35) return "Washing";
  if (progress >= 15) return "Processing";
  return "Received";
}

function calculate(row, now = Date.now()) {
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

function formatDate(msOrDate) {
  const d = msOrDate instanceof Date ? msOrDate : new Date(msOrDate);
  if (!Number.isFinite(d.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-GY", {
    timeZone: "America/Guyana",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function stageStory(stage) {
  const stories = {
    "Received": ["Order received", "Your laundry is in the loop. Our team has received your order and will prepare it for washing."],
    "Processing": ["Preparing your laundry", "Our team is sorting and preparing your items for the wash cycle."],
    "Washing": ["Your laundry is still in the loop!", "Our team is working hard to get your clothes fresh, folded, and done for you."],
    "Drying": ["Almost there!", "Your laundry is drying and moving closer to the finishing line."],
    "Ready for Pick-Up": ["Fresh. Folded. Done.", "Your order is ready for pickup!"],
  };
  return stories[stage] || ["Laundry Loop", "Please check back for the latest update."];
}

function pointOnArc(progress) {
  const cx = 380;
  const cy = 356;
  const r = 245;
  const angle = Math.PI - Math.PI * (progress / 100);
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

function render(row, now = Date.now()) {
  const result = calculate(row, now);
  if (result.progress == null) {
    showMessage("This order is cancelled or unavailable for progress tracking.");
    return;
  }
  hideMessage();

  const progress = result.progress;
  const currentStage = result.displayStage;
  const currentIndex = visualStages.indexOf(currentStage);

  el("gauge-progress").setAttribute("stroke-dasharray", `${progress} 100`);
  const p = pointOnArc(progress);
  el("pointer").setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);

  el("progress-value").textContent = `${progress}%`;
  el("progress-stage").textContent = currentStage.toUpperCase();
  el("order-code-value").textContent = row.tracking_code || "—";
  el("last-updated").textContent = formatDate(result.eventTime);
  el("estimated-pickup").textContent = progress === 100 ? "Ready now" : formatDate(result.eta);

  const [title, copy] = stageStory(currentStage);
  el("status-title").textContent = title;
  el("status-copy").textContent = copy;
  el("confirmed-chip").textContent = `Staff confirmed: ${result.status}`;

  el("notice-copy").textContent = result.express
    ? "Express timing follows the selected turnaround window and remains subject to machine availability. You will receive an update when your order is ready."
    : "In some cases, our staff may have your laundry ready, folded and done before 48 hours. You will receive an update when it is ready for pickup.";

  document.querySelectorAll(".stage-node").forEach((node) => {
    const stage = node.dataset.stage;
    const idx = visualStages.indexOf(stage);
    node.classList.toggle("complete", idx < currentIndex);
    node.classList.toggle("active", idx === currentIndex);
  });

  el("gauge-description").textContent = `Estimated progress ${progress} percent. Staff confirmed status ${result.status}.`;
}

async function lookupOrder(code) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/track_public_order`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_tracking_code: code }),
  });

  if (!response.ok) throw new Error("Unable to load that order.");
  const row = await response.json();
  if (!row) throw new Error("We could not find that order.");
  return row;
}

function showMessage(text) {
  el("message").textContent = text;
  el("message").classList.remove("hidden");
}

function hideMessage() {
  el("message").classList.add("hidden");
}

function demoRow() {
  const stage = el("lab-stage").value;
  const minutes = Number(el("lab-minutes").value);
  const express = el("lab-express").checked;
  const now = Date.now();
  const changed = now - minutes * MINUTE;
  const created = stage === "Received" ? changed : changed - 2 * HOUR;

  return {
    tracking_code: "LAB-1047",
    status: stage,
    created_at: new Date(created).toISOString(),
    status_changed_at: new Date(changed).toISOString(),
    express,
  };
}

el("track-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = el("order-code").value.trim().toUpperCase();
  if (!code) return;

  el("track-button")?.setAttribute("disabled", "disabled");
  try {
    const row = await lookupOrder(code);
    render(row);
  } catch (error) {
    showMessage(error?.message || "Tracking is temporarily unavailable.");
  } finally {
    el("track-button")?.removeAttribute("disabled");
  }
});

el("lab-minutes").addEventListener("input", () => {
  el("lab-minutes-value").textContent = `${el("lab-minutes").value} min`;
});

el("apply-demo").addEventListener("click", () => {
  render(demoRow());
});

el("load-live").addEventListener("click", () => {
  el("track-form").requestSubmit();
});

document.querySelector(".close-button").addEventListener("click", () => {
  document.querySelector(".tracker-card").classList.toggle("preview-dim");
});

render({
  tracking_code: "LAB-1047",
  status: "Washing",
  created_at: new Date(Date.now() - 3 * HOUR).toISOString(),
  status_changed_at: new Date(Date.now() - 30 * MINUTE).toISOString(),
  express: false,
});
