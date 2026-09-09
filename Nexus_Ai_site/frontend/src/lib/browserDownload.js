export const BROWSER_VERSION = import.meta.env.VITE_BROWSER_VERSION || '0.4.1';

export const BROWSER_RELEASES_URL =
  import.meta.env.VITE_BROWSER_RELEASES_URL ||
  'https://github.com/dabstebplay2-jpg/Nexus_browser/releases/latest';

export const BROWSER_SETUP_URL =
  import.meta.env.VITE_BROWSER_SETUP_URL ||
  `https://github.com/dabstebplay2-jpg/Nexus_browser/releases/latest/download/NexusBrowser-${BROWSER_VERSION}-Setup.exe`;

export const BROWSER_PORTABLE_URL =
  import.meta.env.VITE_BROWSER_PORTABLE_URL ||
  `https://github.com/dabstebplay2-jpg/Nexus_browser/releases/latest/download/NexusBrowser-${BROWSER_VERSION}-Portable.exe`;

export const BROWSER_PAGE_PATH = '/browser';
