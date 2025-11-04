// 轻量级 fetch 拦截器：监听发起到 /api/av/* 的请求与响应，不破坏原有行为
// 使用方式：
//   const stop = interceptFetch({
//     filter: (url) => url.includes('/api/av/'),
//     onResponse: async (ctx) => { /* ctx.url/method/reqBody/resStatus/resBody */ }
//   });
//   // 需要时调用 stop() 取消拦截

export type InterceptContext = {
  url: string;
  method: string;
  headers: Record<string, string>;
  // 原始请求体（若可读），字符串或对象（已 JSON 解析）
  reqBody?: unknown;
  // 响应信息
  resStatus: number;
  resOk: boolean;
  resBody?: unknown; // 已尝试解析为 JSON，失败则为字符串
  durationMs: number;
};

type InterceptOptions = {
  filter?: (url: string, method: string) => boolean;
  onRequest?: (info: {
    url: string;
    method: string;
    headers: Record<string, string>;
    reqBody?: unknown;
    startAt: number;
  }) => void | Promise<void>;
  onResponse?: (ctx: InterceptContext) => void | Promise<void>;
};

let originalFetch: typeof fetch | null = null;
let installed = false;
let silenced = false; // 全局静音开关（避免本插件自身更新再被监听导致循环）

export function setInterceptorSilenced(v: boolean) {
  silenced = v;
}

/** 安装拦截器，返回卸载函数 */
export function interceptFetch(opts: InterceptOptions = {}): () => void {
  if (installed) {
    // 已安装则返回一个空卸载函数
    return () => {};
  }
  originalFetch = window.fetch.bind(window);
  installed = true;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const startAt = Date.now();
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const shouldHandle = !silenced && (opts.filter ? opts.filter(url, method) : true);

    // 尝试读取请求头
    const headers: Record<string, string> = {};
    const srcHeaders = (init?.headers || (input instanceof Request ? input.headers : undefined)) as HeadersInit | undefined;
    if (srcHeaders) {
      const h = new Headers(srcHeaders as any);
      h.forEach((v, k) => { headers[k] = v; });
    }

    // 尝试读取请求体（不消耗原始流）
    let reqBody: unknown = undefined;
    if (shouldHandle) {
      try {
        if (init?.body && typeof init.body === 'string') {
          reqBody = tryParseJson(init.body);
        } else if (input instanceof Request) {
          const clone = input.clone();
          const text = await clone.text();
          reqBody = text ? tryParseJson(text) : undefined;
        }
      } catch {
        // ignore
      }
      try { await opts.onRequest?.({ url, method, headers, reqBody, startAt }); } catch { /* noop */ }
    }

    const res = await (originalFetch as any)(input, init);

    if (!shouldHandle) return res;

    // 读取响应（通过 clone，不影响返回给调用方的 res）
    const endAt = Date.now();
    const resClone = res.clone();
    let resBody: unknown = undefined;
    try {
      const text = await resClone.text();
      resBody = text ? tryParseJson(text) : undefined;
    } catch {
      // ignore
    }

    try {
      await opts.onResponse?.({
        url,
        method,
        headers,
        reqBody,
        resStatus: res.status,
        resOk: res.ok,
        resBody,
        durationMs: endAt - startAt,
      });
    } catch {
      // ignore
    }

    return res;
  }) as typeof fetch;

  // 卸载函数
  return () => {
    if (installed && originalFetch) {
      window.fetch = originalFetch;
    }
    installed = false;
    originalFetch = null;
  };
}

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}
