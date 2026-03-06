export interface WpsBrowserEnvOptions {
    userAgent?: string;
    acceptLanguages?: string;
    partition?: string;
    emulateBrowserEnv?: boolean;
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DEFAULT_ACCEPT_LANGUAGES = 'zh-CN,zh,en-US,en';
const DEFAULT_PARTITION = 'persist:st-wps';
const REAL_BROWSER_WEB_PREFERENCES = 'javascript=yes,contextIsolation=no,nativeWindowOpen=yes,sandbox=no,webSecurity=yes,spellcheck=yes';
const BASIC_WEB_PREFERENCES = 'contextIsolation, nativeWindowOpen, javascript=yes';

export function getWpsWebviewUserAgent(userAgent?: string) {
    return userAgent || DEFAULT_USER_AGENT;
}

export function getWpsAcceptLanguages(acceptLanguages?: string) {
    return acceptLanguages || DEFAULT_ACCEPT_LANGUAGES;
}

export function getWpsPartition(partition?: string) {
    return partition || DEFAULT_PARTITION;
}

export function getWpsWebPreferences(emulateBrowserEnv = true) {
    return emulateBrowserEnv ? REAL_BROWSER_WEB_PREFERENCES : BASIC_WEB_PREFERENCES;
}

export function getWpsWebviewAttributes(options: WpsBrowserEnvOptions = {}) {
    const emulateBrowserEnv = options.emulateBrowserEnv !== false;
    return {
        partition: getWpsPartition(options.partition),
        acceptlanguages: getWpsAcceptLanguages(options.acceptLanguages),
        httpreferrer: 'https://www.kdocs.cn/',
        webpreferences: getWpsWebPreferences(emulateBrowserEnv),
        useragent: getWpsWebviewUserAgent(options.userAgent),
    };
}

export function getWpsBrowserEnvScript(options: WpsBrowserEnvOptions = {}) {
    const userAgent = JSON.stringify(getWpsWebviewUserAgent(options.userAgent));
    const acceptLanguages = getWpsAcceptLanguages(options.acceptLanguages);
    const languages = JSON.stringify(acceptLanguages.split(',').map(item => item.trim()).filter(Boolean));

    return `(() => {
  try {
    if (window.__ST_WPS_BROWSER_ENV_APPLIED__) return true;
    window.__ST_WPS_BROWSER_ENV_APPLIED__ = true;

    const ua = ${userAgent};
    const languages = ${languages};
    const platform = 'Win32';
    const vendor = 'Google Inc.';
    const appVersion = ua.replace(/^Mozilla\//, '5.0 ');

    const defineGetter = (target, key, value) => {
      try {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: true,
          get: typeof value === 'function' ? value : () => value,
        });
      } catch (_) {}
    };

    const navProto = Object.getPrototypeOf(navigator);
    defineGetter(navProto, 'userAgent', ua);
    defineGetter(navProto, 'appVersion', appVersion);
    defineGetter(navProto, 'platform', platform);
    defineGetter(navProto, 'vendor', vendor);
    defineGetter(navProto, 'language', languages[0] || 'zh-CN');
    defineGetter(navProto, 'languages', languages);
    defineGetter(navProto, 'onLine', true);
    defineGetter(navProto, 'webdriver', false);
    defineGetter(navProto, 'hardwareConcurrency', 8);
    defineGetter(navProto, 'deviceMemory', 8);
    defineGetter(navProto, 'maxTouchPoints', 0);
    defineGetter(navProto, 'pdfViewerEnabled', true);
    defineGetter(navProto, 'cookieEnabled', true);
    defineGetter(navProto, 'doNotTrack', null);

    const fakePlugin = (name, filename, description) => ({
      name,
      filename,
      description,
      length: 1,
      0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    });
    const plugins = [
      fakePlugin('Chrome PDF Plugin', 'internal-pdf-viewer', 'Portable Document Format'),
      fakePlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', ''),
      fakePlugin('Native Client', 'internal-nacl-plugin', '')
    ];
    defineGetter(navProto, 'plugins', plugins);
    defineGetter(navProto, 'mimeTypes', [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    ]);

    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        enumerable: true,
        value: {
          app: { isInstalled: false },
          runtime: {},
          webstore: {},
          csi: () => ({ onloadT: Date.now(), startE: Date.now(), pageT: Date.now() }),
          loadTimes: () => ({
            commitLoadTime: Date.now() / 1000,
            finishDocumentLoadTime: Date.now() / 1000,
            finishLoadTime: Date.now() / 1000,
            firstPaintAfterLoadTime: 0,
            firstPaintTime: Date.now() / 1000,
            navigationType: 'Other',
            npnNegotiatedProtocol: 'h2',
            requestTime: Date.now() / 1000,
            startLoadTime: Date.now() / 1000,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: true,
            wasNpnNegotiated: true,
          })
        }
      });
    }

    if (navigator.permissions && navigator.permissions.query) {
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (parameters) => {
        if (parameters && parameters.name === 'notifications') {
          return Promise.resolve({
            state: Notification.permission,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return true; }
          });
        }
        return originalQuery(parameters);
      };
    }

    defineGetter(screen, 'colorDepth', 24);
    defineGetter(screen, 'pixelDepth', 24);
    defineGetter(screen, 'availWidth', () => screen.width || window.innerWidth || 1920);
    defineGetter(screen, 'availHeight', () => screen.height || window.innerHeight || 1080);

    try {
      const originalGetParameter = WebGLRenderingContext && WebGLRenderingContext.prototype && WebGLRenderingContext.prototype.getParameter;
      if (originalGetParameter && !WebGLRenderingContext.prototype.__stWrappedGetParameter) {
        WebGLRenderingContext.prototype.__stWrappedGetParameter = true;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return 'Intel Inc.';
          if (parameter === 37446) return 'Intel(R) Iris(TM) Graphics';
          return originalGetParameter.call(this, parameter);
        };
      }
    } catch (_) {}

    try {
      const style = document.createElement('style');
      style.setAttribute('data-st-wps-browser-env', '1');
      style.textContent = 'html { color-scheme: light; }';
      document.documentElement.appendChild(style);
    } catch (_) {}

    return true;
  } catch (error) {
    console.warn('apply WPS browser env failed', error);
    return false;
  }
})();`;
}
