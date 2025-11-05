// 轻量级多路复用 fetch 拦截器：支持多个独立监听者互不干扰
// 使用方式：
//   const handle = interceptFetch({
//     filter: (url) => url.includes('/api/av/'),
//     onResponse: async (ctx) => { /* ctx.url/method/reqBody/resStatus/resBody */ }
//   });
//   handle.setSilenced(true/false) // 控制仅本监听者的静音
//   handle.stop() // 注销本监听者

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

export type InterceptorHandle = {
  stop: () => void;
  setSilenced: (v: boolean) => void;
};

let originalFetch: typeof fetch | null = null;
let installed = false;

type Listener = {
  id: number;
  opts: InterceptOptions;
  silenced: boolean;
};
const listeners: Listener[] = [];
let idSeq = 1;

// 活跃标签：用于给本次请求打标（例如只在滴答相关写入时标记，监听方据此跳过）
const activeTags = new Set<string>();

export function beginTaggedRequests(tag: string) {
  activeTags.add(tag);
}

export function endTaggedRequests(tag: string) {
  activeTags.delete(tag);
}

/**
 * 兼容旧全局静音：将应用于所有监听者（不推荐，尽量使用 handle.setSilenced）
 */
export function setInterceptorSilenced(v: boolean) {
  for (const l of listeners) l.silenced = v;
}

/** 安装拦截器，返回卸载函数 */
export function interceptFetch(opts: InterceptOptions = {}): InterceptorHandle {
  // 安装总拦截器（只安装一次）
  if (!installed) {
    originalFetch = window.fetch.bind(window);
    installed = true;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const startAt = Date.now();
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

      // 若存在活跃标签，则将标签信息注入到请求头（不会影响服务端处理，供拦截器识别）
      if (activeTags.size > 0) {
        const tagHeaderMap: Record<string, string> = {};
        for (const t of activeTags) {
          tagHeaderMap[`x-st-tag-${t}`] = '1';
        }
        const tagsList = Array.from(activeTags).join(',');
        tagHeaderMap['x-st-tags'] = tagsList;

        if (init) {
          const merged = new Headers(init.headers as any);
          Object.entries(tagHeaderMap).forEach(([k, v]) => merged.set(k, v));
          init.headers = merged as any;
        } else if (input instanceof Request) {
          // 尽量在 init 缺失时也注入（注意：不处理 body 复制以避免复杂度，常见场景下我们都有 init）
          const merged = new Headers((input.headers as any) || {});
          Object.entries(tagHeaderMap).forEach(([k, v]) => merged.set(k, v));
          init = { headers: merged };
        } else {
          // 字符串 URL 且无 init，构造一个 headers
          init = { headers: tagHeaderMap } as any;
        }
      }

      // 读取请求头
      const headers: Record<string, string> = {};
      const srcHeaders = (init?.headers || (input instanceof Request ? input.headers : undefined)) as HeadersInit | undefined;
      if (srcHeaders) {
        const h = new Headers(srcHeaders as any);
        h.forEach((v, k) => { headers[k] = v; });
      }

      // 仅在有监听者且至少一个匹配时再读取 body，避免无谓开销
      let reqBody: unknown = undefined;
      const anyWants = listeners.some(l => !l.silenced && (l.opts.filter ? l.opts.filter(url, method) : true));
      if (anyWants) {
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
        // 分发 onRequest（逐个监听者）
        await Promise.allSettled(listeners.map(l => {
          if (l.silenced) return Promise.resolve();
          const ok = l.opts.filter ? l.opts.filter(url, method) : true;
          if (!ok) return Promise.resolve();
          return Promise.resolve(l.opts.onRequest?.({ url, method, headers, reqBody, startAt })) as Promise<any>;
        }));
      }

  const res = await (originalFetch as any)(input, init);

      if (!anyWants) return res;

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

      const ctx: InterceptContext = {
        url,
        method,
        headers,
        reqBody,
        resStatus: res.status,
        resOk: res.ok,
        resBody,
        durationMs: endAt - startAt,
      };

      await Promise.allSettled(listeners.map(l => {
        if (l.silenced) return Promise.resolve();
        const ok = l.opts.filter ? l.opts.filter(url, method) : true;
        if (!ok) return Promise.resolve();
        return Promise.resolve(l.opts.onResponse?.(ctx)) as Promise<any>;
      }));

      return res;
    }) as typeof fetch;
  }

  // 注册一个监听者
  const l: Listener = { id: idSeq++, opts, silenced: false };
  listeners.push(l);

  const handle: InterceptorHandle = {
    stop: () => {
      const idx = listeners.findIndex(x => x.id === l.id);
      if (idx >= 0) listeners.splice(idx, 1);
      // 若无监听者则还原 fetch
      if (listeners.length === 0 && installed && originalFetch) {
        window.fetch = originalFetch;
        installed = false;
        originalFetch = null;
      }
    },
    setSilenced: (v: boolean) => { l.silenced = v; },
  };

  return handle;
}

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}
