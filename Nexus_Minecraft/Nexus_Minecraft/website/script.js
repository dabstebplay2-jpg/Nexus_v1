const repo = window.NEXUS_REPO || "dabstebplay2-jpg/Nexus_mincraft_laucher";
const fallbackVersion = window.NEXUS_VERSION || "1.1.4.2";

const menuBtn = document.getElementById("menuBtn");
const nav = document.getElementById("nav");

if (menuBtn && nav) {
  menuBtn.addEventListener("click", () => nav.classList.toggle("open"));
  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => nav.classList.remove("open"));
  });
}

const $ = (id) => document.getElementById(id);

const els = {
  versionText: $("versionText"),
  versionStat: $("versionStat"),
  releaseVersion: $("releaseVersion"),
  footerVersion: $("footerVersion"),
  downloadBtn: $("downloadBtn"),
  setupBtn: $("setupBtn"),
  portableBtn: $("portableBtn"),
  copyLinkBtn: $("copyLinkBtn"),
  fileName: $("fileName"),
  releaseStatus: $("releaseStatus"),
  releaseDate: $("releaseDate"),
  releaseSize: $("releaseSize"),
  consoleStatus: $("consoleStatus"),
};

let currentSetupUrl = "";

function cleanVersion(version) {
  return String(version || fallbackVersion).replace(/^v/i, "");
}

function fileNames(version) {
  const clean = cleanVersion(version);
  return {
    setup: `NexusLauncherSetup-${clean}-win-x64.exe`,
    portable: `NexusLauncher-${clean}-win-x64-portable.zip`,
  };
}

function downloadUrl(file) {
  return `https://github.com/${repo}/releases/latest/download/${file}`;
}

function fmtBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "неизвестно";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function fmtDate(value) {
  if (!value) return "неизвестно";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function setConsoleStatus(label) {
  if (!els.consoleStatus) return;
  els.consoleStatus.innerHTML =
    '<span class="console-status__dot" aria-hidden="true"></span>' + label;
}

function setRelease(version, release = null) {
  const clean = cleanVersion(version);
  const files = fileNames(clean);
  const setupUrl = downloadUrl(files.setup);
  const portableUrl = downloadUrl(files.portable);
  currentSetupUrl = setupUrl;

  [els.versionText, els.versionStat, els.releaseVersion, els.footerVersion].forEach((el) => {
    if (el) el.textContent = clean;
  });

  [els.downloadBtn, els.setupBtn].forEach((el) => {
    if (el) el.href = setupUrl;
  });

  if (els.portableBtn) {
    els.portableBtn.href = portableUrl;
    const portableSmall = els.portableBtn.querySelector("small");
    if (portableSmall) portableSmall.textContent = files.portable;
  }

  if (els.fileName) els.fileName.textContent = files.setup;

  if (release) {
    setConsoleStatus("LIVE");
    if (els.releaseStatus) els.releaseStatus.textContent = "GitHub Release подключён";
    if (els.releaseDate) els.releaseDate.textContent = fmtDate(release.published_at || release.created_at);

    const setupAsset = Array.isArray(release.assets)
      ? release.assets.find((asset) => asset.name === files.setup)
      : null;

    if (els.releaseSize) {
      els.releaseSize.textContent = setupAsset ? fmtBytes(setupAsset.size) : "asset ожидается";
    }
  } else {
    setConsoleStatus("STABLE");
    if (els.releaseStatus) els.releaseStatus.textContent = `Стабильный релиз ${clean}`;
  }
}

function applyReleaseMetadata(metadata) {
  if (!metadata) return;

  const clean = cleanVersion(metadata.version);
  const files = fileNames(clean);
  const setupUrl =
    metadata.direct_download ||
    metadata.download_url ||
    metadata.installer ||
    downloadUrl(files.setup);
  const portableUrl =
    metadata.portable_download ||
    metadata.portable_download_url ||
    metadata.portable ||
    downloadUrl(files.portable);

  currentSetupUrl = setupUrl;

  [els.versionText, els.versionStat, els.releaseVersion, els.footerVersion].forEach((el) => {
    if (el) el.textContent = clean;
  });

  [els.downloadBtn, els.setupBtn].forEach((el) => {
    if (el) el.href = setupUrl;
  });

  if (els.portableBtn) {
    els.portableBtn.href = portableUrl;
    const portableSmall = els.portableBtn.querySelector("small");
    if (portableSmall) portableSmall.textContent = metadata.portable_filename || files.portable;
  }

  if (els.fileName) {
    els.fileName.textContent = metadata.installer_filename || metadata.filename || files.setup;
  }

  setConsoleStatus("STABLE");
  if (els.releaseStatus) els.releaseStatus.textContent = "Стабильный релиз";
}

setRelease(fallbackVersion);

fetch("release.json", { cache: "no-store" })
  .then((res) => (res.ok ? res.json() : null))
  .then(applyReleaseMetadata)
  .catch(() => {});

fetch(`https://api.github.com/repos/${repo}/releases/latest`, { cache: "no-store" })
  .then((res) => (res.ok ? res.json() : null))
  .then((release) => {
    if (!release || !release.tag_name) return;
    setRelease(release.tag_name, release);
  })
  .catch(() => {
    setConsoleStatus("STABLE");
    if (els.releaseStatus) els.releaseStatus.textContent = "GitHub API недоступен";
  });

if (els.copyLinkBtn) {
  els.copyLinkBtn.addEventListener("click", async () => {
    const url = currentSetupUrl || downloadUrl(fileNames(fallbackVersion).setup);
    try {
      await navigator.clipboard.writeText(url);
      const old = els.copyLinkBtn.textContent;
      els.copyLinkBtn.textContent = "Ссылка скопирована";
      setTimeout(() => (els.copyLinkBtn.textContent = old), 1400);
    } catch {
      window.prompt("Скопируй ссылку:", url);
    }
  });
}
