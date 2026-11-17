import { Adb, AdbDaemonTransport, escapeArg } from "@yume-chan/adb";
import {
  AdbDaemonWebUsbDevice,
  AdbDaemonWebUsbDeviceManager,
} from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import {
  DynamicScheme,
  Hct,
  SchemeExpressive,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
  hexFromArgb,
  argbFromHex,
} from "@material/material-color-utilities";

const SETTING = "theme_customization_overlay_packages";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  connect: $<HTMLButtonElement>("connect"),
  disconnect: $<HTMLButtonElement>("disconnect"),
  device: $("device"),
  picker: $<HTMLInputElement>("picker"),
  hex: $<HTMLInputElement>("hex"),
  style: $<HTMLSelectElement>("style"),
  swatches: $("swatches"),
  prevLight: $("prevLight"),
  prevDark: $("prevDark"),
  tones: $("tones"),
  apply: $<HTMLButtonElement>("apply"),
  restore: $<HTMLButtonElement>("restore"),
  read: $<HTMLButtonElement>("read"),
  log: $("log"),
  clockPicker: $<HTMLInputElement>("clockPicker"),
  clockHex: $<HTMLInputElement>("clockHex"),
  clockSame: $<HTMLButtonElement>("clockSame"),
  clockApply: $<HTMLButtonElement>("clockApply"),
};

const CLOCK_SETTING = "lock_screen_custom_clock_face";

const log = (msg: string) => {
  ui.log.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n` + ui.log.textContent;
};

// ---------- ADB over WebUSB ----------

let adb: Adb | undefined;
const credentialStore = new AdbWebCredentialStore("Color Unlocker");

async function connect() {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) {
    log("WebUSB is not available. Use Chrome or Edge on desktop.");
    return;
  }
  const device = await manager.requestDevice();
  if (!device) return;

  let connection;
  try {
    connection = await device.connect();
  } catch (e) {
    if (e instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
      log("Device is busy: another program (adb.exe) holds it. Run `adb kill-server` and try again.");
    } else {
      log(`Connection failed: ${e}`);
    }
    return;
  }

  log("Waiting for authorization. Check the phone for the USB debugging prompt...");
  const transport = await AdbDaemonTransport.authenticate({
    serial: device.serial,
    connection,
    credentialStore,
  });
  adb = new Adb(transport);
  void adb.disconnected.then(onDisconnected);

  const model = (await shell(["getprop", "ro.product.model"])).trim();
  const release = (await shell(["getprop", "ro.build.version.release"])).trim();
  ui.device.textContent = `${model} · Android ${release}`;
  setConnected(true);
  log(`Connected to ${model}.`);
  await readCurrent();
}

function onDisconnected() {
  adb = undefined;
  ui.device.textContent = "Not connected";
  setConnected(false);
  log("Disconnected.");
}

function setConnected(on: boolean) {
  ui.connect.hidden = on;
  ui.disconnect.hidden = !on;
  ui.apply.disabled = ui.restore.disabled = ui.read.disabled = ui.clockApply.disabled = !on;
}

// ---------- Lock screen clock ----------

function setClockColor(hex: string) {
  hex = hex.toUpperCase();
  ui.clockPicker.value = hex.toLowerCase();
  ui.clockHex.value = hex;
}

async function readClock() {
  const raw = (await shell(["settings", "get", "secure", CLOCK_SETTING])).trim();
  if (!raw || raw === "null") return;
  try {
    const seed = JSON.parse(raw).seedColor;
    if (typeof seed === "number") {
      setClockColor("#" + (seed >>> 0).toString(16).padStart(8, "0").slice(2));
    }
  } catch {}
}

async function applyClock() {
  // Keep the existing clock face, font axes etc.; only replace the color.
  const raw = (await shell(["settings", "get", "secure", CLOCK_SETTING])).trim();
  let obj: Record<string, any> = { clockId: "DEFAULT", metadata: {} };
  if (raw && raw !== "null") {
    try {
      obj = JSON.parse(raw);
    } catch {}
  }
  const hex = ui.clockHex.value.replace("#", "");
  obj.seedColor = parseInt("FF" + hex, 16) | 0; // signed 32-bit ARGB, as Android stores it
  obj.metadata = {
    ...obj.metadata,
    appliedTimestamp: Date.now(),
    metadataSelectedColorId: "CUSTOM",
  };
  const out = await shell(["settings", "put", "secure", CLOCK_SETTING, JSON.stringify(obj)]);
  if (out.trim()) log(out.trim());
  log(`Clock color set to #${hex.toUpperCase()}.`);
}

async function shell(args: string[]): Promise<string> {
  if (!adb) throw new Error("Not connected");
  // The library joins args with plain spaces and the device runs them through sh,
  // so each arg must be quoted here or JSON quotes get stripped ("bad arguments").
  return adb.subprocess.noneProtocol.spawnWaitText(args.map(escapeArg));
}

async function getSetting(): Promise<Record<string, unknown>> {
  const raw = (await shell(["settings", "get", "secure", SETTING])).trim();
  if (!raw || raw === "null") return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function putSetting(obj: Record<string, unknown>) {
  const json = JSON.stringify(obj);
  const out = await shell(["settings", "put", "secure", SETTING, json]);
  if (out.trim()) log(out.trim());
}

async function readCurrent() {
  const cur = await getSetting();
  log(`Current: ${JSON.stringify(cur)}`);
  await readClock();
  const palette = cur["android.theme.customization.system_palette"];
  const style = cur["android.theme.customization.theme_style"];
  if (cur["android.theme.customization.color_source"] === "preset" && typeof palette === "string") {
    setColor("#" + palette.replace(/^(0x)?(ff)?/i, "").slice(-6));
  }
  if (typeof style === "string" && [...ui.style.options].some((o) => o.value === style)) {
    ui.style.value = style;
    render();
  }
}

async function apply() {
  const hex = ui.hex.value.replace("#", "").toUpperCase();
  const argb = "FF" + hex;
  await putSetting({
    "android.theme.customization.color_source": "preset",
    "android.theme.customization.system_palette": argb,
    "android.theme.customization.accent_color": argb,
    "android.theme.customization.theme_style": ui.style.value,
    "android.theme.customization.color_both": "1",
    _applied_timestamp: Date.now(),
  });
  log(`Applied #${hex} (${ui.style.value}).`);
}

async function restoreWallpaper() {
  await putSetting({
    "android.theme.customization.color_source": "home_wallpaper",
    "android.theme.customization.theme_style": ui.style.value,
    "android.theme.customization.color_both": "1",
    _applied_timestamp: Date.now(),
  });
  log("Switched back to wallpaper colors.");
}

// ---------- Color selection & preview ----------

const SWATCHES = [
  "#FF1744", "#F50057", "#D500F9", "#651FFF", "#2962FF", "#00B0FF",
  "#00E5FF", "#1DE9B6", "#00C853", "#76FF03", "#FFEA00", "#FFC400",
  "#FF9100", "#FF3D00", "#8D6E63", "#607D8B",
];

const SCHEMES: Record<string, new (hct: Hct, dark: boolean, contrast: number) => DynamicScheme> = {
  TONAL_SPOT: SchemeTonalSpot,
  VIBRANT: SchemeVibrant,
  EXPRESSIVE: SchemeExpressive,
  RAINBOW: SchemeRainbow,
  FRUIT_SALAD: SchemeFruitSalad,
  SPRITZ: SchemeNeutral,
  MONOCHROMATIC: SchemeMonochrome,
};

function setColor(hex: string) {
  hex = hex.toUpperCase();
  ui.picker.value = hex.toLowerCase();
  ui.hex.value = hex;
  render();
}

function render() {
  const Scheme = SCHEMES[ui.style.value] ?? SchemeTonalSpot;
  const hct = Hct.fromInt(argbFromHex(ui.hex.value));
  ui.prevLight.innerHTML = phoneMock(new Scheme(hct, false, 0), "Light");
  ui.prevDark.innerHTML = phoneMock(new Scheme(hct, true, 0), "Dark");

  const s = new Scheme(hct, false, 0);
  const rows: [string, typeof s.primaryPalette][] = [
    ["Primary", s.primaryPalette],
    ["Secondary", s.secondaryPalette],
    ["Tertiary", s.tertiaryPalette],
    ["Neutral", s.neutralPalette],
  ];
  const tones = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95];
  ui.tones.innerHTML = rows
    .map(
      ([name, p]) =>
        `<div class="tone-row"><span>${name}</span>${tones
          .map((t) => `<i style="background:${hexFromArgb(p.tone(t))}" title="${t}"></i>`)
          .join("")}</div>`,
    )
    .join("");
}

function phoneMock(s: DynamicScheme, label: string) {
  const c = (n: number) => hexFromArgb(n);
  return `
  <div class="mock" style="background:${c(s.surface)};color:${c(s.onSurface)}">
    <div class="mock-label">${label}</div>
    <div class="mock-slider"><div style="background:${c(s.primary)}"></div></div>
    <div class="mock-tiles">
      <div style="background:${c(s.primary)};color:${c(s.onPrimary)}">Wi-Fi</div>
      <div style="background:${c(s.surfaceContainerHighest)}">BT</div>
      <div style="background:${c(s.primaryContainer)};color:${c(s.onPrimaryContainer)}">DND</div>
      <div style="background:${c(s.secondaryContainer)};color:${c(s.onSecondaryContainer)}">Torch</div>
      <div style="background:${c(s.tertiaryContainer)};color:${c(s.onTertiaryContainer)}">Cast</div>
      <div style="background:${c(s.surfaceContainerHighest)}">Alarm</div>
    </div>
    <div class="mock-fab" style="background:${c(s.tertiary)};color:${c(s.onTertiary)}">+</div>
  </div>`;
}

// ---------- Wiring ----------

ui.swatches.innerHTML = SWATCHES.map(
  (h) => `<button class="sw" data-hex="${h}" style="background:${h}" title="${h}"></button>`,
).join("");
ui.swatches.addEventListener("click", (e) => {
  const hex = (e.target as HTMLElement).dataset.hex;
  if (hex) setColor(hex);
});
ui.picker.addEventListener("input", () => setColor(ui.picker.value));
ui.hex.addEventListener("input", () => {
  let v = ui.hex.value.trim();
  if (!v.startsWith("#")) v = "#" + v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
});
ui.style.addEventListener("change", render);
ui.clockPicker.addEventListener("input", () => setClockColor(ui.clockPicker.value));
ui.clockHex.addEventListener("input", () => {
  let v = ui.clockHex.value.trim();
  if (!v.startsWith("#")) v = "#" + v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) setClockColor(v);
});
ui.clockSame.addEventListener("click", () => setClockColor(ui.hex.value));

const guard = (fn: () => Promise<void>) => async () => {
  try {
    await fn();
  } catch (e) {
    log(`Error: ${e instanceof Error ? e.message : e}`);
  }
};
ui.connect.addEventListener("click", guard(connect));
ui.disconnect.addEventListener("click", guard(async () => adb?.close()));
ui.apply.addEventListener("click", guard(apply));
ui.restore.addEventListener("click", guard(restoreWallpaper));
ui.read.addEventListener("click", guard(readCurrent));
ui.clockApply.addEventListener("click", guard(applyClock));

render();
