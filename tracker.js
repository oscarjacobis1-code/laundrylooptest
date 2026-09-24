import { calculate, visualStages, HOUR, MINUTE } from "./math.js";

const SUPABASE_URL = "https://coohutrnqcxjhkxprama.supabase.co";
const SUPABASE_KEY = "sb_publishable_WwvZpvMkiHM3YOLhwty85g_wGZKQ84e";

const el = (id) => document.getElementById(id);

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

  // The dial has 20 equal 5% segments. Keep the displayed percentage exact,
  // but place the hanger at the center of the active segment so it visually
  // sits squarely on one block rather than on a gap between blocks.
  const segmentSize = 5;
  const segmentStart = Math.min(95, Math.floor(Math.max(0, progress) / segmentSize) * segmentSize);
  const pointerProgress = progress >= 100 ? 100 : segmentStart + segmentSize / 2;
  const angle = Math.PI - Math.PI * (pointerProgress / 100);

  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}


function positionStageRing() {
  const visual = document.querySelector(".visual-stage");
  const gauge = document.querySelector(".gauge-svg");
  if (!visual || !gauge) return;

  const visualRect = visual.getBoundingClientRect();
  const gaugeRect = gauge.getBoundingClientRect();

  // The SVG viewBox is 760 × 470 and its arc center is (380, 356), radius 245.
  // Convert that center/radius into the current rendered pixel size.
  const sx = gaugeRect.width / 760;
  const sy = gaugeRect.height / 470;
  const centerX = (gaugeRect.left - visualRect.left) + 380 * sx;
  const centerY = (gaugeRect.top - visualRect.top) + 356 * sy;
  const gaugeRadius = 245 * Math.min(sx, sy);

  // Keep markers on a concentric outer arc rather than floating above the dial.
  const outerRadius = gaugeRadius + Math.max(28, gaugeRadius * 0.22);

  const stageAngles = new Map([
    ["Received", 180],
    ["Processing", 135],
    ["Washing", 90],
    ["Drying", 45],
    ["Ready for Pick-Up", 0],
  ]);

  document.querySelectorAll(".stage-node").forEach((node) => {
    const stage = node.dataset.stage;
    const degrees = stageAngles.get(stage);
    if (degrees == null) return;
    const radians = degrees * Math.PI / 180;
    const x = centerX + outerRadius * Math.cos(radians);
    const y = centerY - outerRadius * Math.sin(radians);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  });

  const connectorAngles = [157.5, 112.5, 67.5, 22.5];
  document.querySelectorAll(".connector").forEach((dot, index) => {
    const degrees = connectorAngles[index];
    const radians = degrees * Math.PI / 180;
    const dotRadius = gaugeRadius + Math.max(15, gaugeRadius * 0.11);
    const x = centerX + dotRadius * Math.cos(radians);
    const y = centerY - dotRadius * Math.sin(radians);
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
  });
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

  el("gauge-progress-mask").setAttribute("stroke-dasharray", `${progress} 100`);
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
  requestAnimationFrame(positionStageRing);
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


window.addEventListener("resize", positionStageRing);
requestAnimationFrame(positionStageRing);
