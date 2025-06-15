export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 从环境变量中读取配置
    // 请在 Cloudflare Worker 的设置中配置以下环境变量:
    // DIDATICK_CLIENT_ID: 您的滴答清单应用的 Client ID
    // DIDATICK_CLIENT_SECRET: 您的滴答清单应用的 Client Secret
    // DIDATICK_REDIRECT_URI: 您的 Worker 的回调 URL (例如: https://your-worker-name.your-account.workers.dev/callback)
    // DIDATICK_SCOPES: 请求的权限范围 (例如: "tasks:write tasks:read")

    const CLIENT_ID = env.DIDATICK_CLIENT_ID;
    const CLIENT_SECRET = env.DIDATICK_CLIENT_SECRET;
    const REDIRECT_URI = env.DIDATICK_REDIRECT_URI; // 例如: "https://your-worker.your-subdomain.workers.dev/callback"
    const SCOPES = env.DIDATICK_SCOPES || "tasks:read tasks:write"; // 默认权限

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return new Response(
        "错误：请在 Worker 环境变量中配置 DIDATICK_CLIENT_ID, DIDATICK_CLIENT_SECRET, 和 DIDATICK_REDIRECT_URI。",
        { status: 500 }
      );
    }

    if (url.pathname === "/authorize") {
      // 第一步: 重定向用户到滴答清单授权页面
      const state = crypto.randomUUID(); // 生成一个随机 state 值以防止 CSRF
      // 注意：在生产环境中，您应该存储此 state 并在回调时进行验证。
      // 为简化示例，此处未实现验证。

      const authorizationUrl = new URL("https://dida365.com/oauth/authorize");
      authorizationUrl.searchParams.set("client_id", CLIENT_ID);
      authorizationUrl.searchParams.set("scope", SCOPES);
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authorizationUrl.searchParams.set("response_type", "code");

      return Response.redirect(authorizationUrl.toString(), 302);
    }

    if (url.pathname === "/callback") {
      // 第二步: 处理滴答清单的回调
      const code = url.searchParams.get("code");
      const receivedState = url.searchParams.get("state"); // 可选: 验证 state

      if (!code) {
        return new Response("错误：回调中未找到授权码 (code)。", { status: 400 });
      }

      // 可选: 验证 state 值以防止 CSRF 攻击
      // if (receivedState !== expectedState) {
      //   return new Response("错误：state 值不匹配。", { status: 403 });
      // }

      // 第三步: 用授权码交换 Access Token
      try {
        const tokenUrl = "https://dida365.com/oauth/token";
        const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`); // Base64 编码

        const response = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${basicAuth}`,
          },
          body: new URLSearchParams({
            client_id: CLIENT_ID,       // 根据文档，也需要在 body 中提供
            client_secret: CLIENT_SECRET, // 根据文档，也需要在 body 中提供
            code: code,
            grant_type: "authorization_code",
            scope: SCOPES,
            redirect_uri: REDIRECT_URI,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            `获取 Token 失败: ${response.status} ${response.statusText}\n错误详情: ${errorText}`,
            { status: response.status }
          );
        }

        const tokenData = await response.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
          return new Response("错误：响应中未找到 access_token。", { status: 500 });
        }

        // 成功获取 Token
        // 在实际应用中，您应该安全地存储此 Token 或将其传递给客户端
        return new Response(
          `成功获取 Access Token!\n\nAccess Token: ${accessToken}\n\n完整响应:\n${JSON.stringify(tokenData, null, 2)}`,
          { headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );

      } catch (error) {
        console.error("Token exchange error:", error);
        return new Response(`Token 交换过程中发生错误: ${error.message}`, { status: 500 });
      }
    }

    // 默认页面，提供指引
    return new Response(
      `滴答清单 OAuth2 辅助工具\n\n1. 访问 /authorize 路径以开始授权流程。\n2. 您将被重定向到滴答清单进行授权。\n3. 授权后，滴答清单会将您重定向回此 Worker 的 /callback 路径。\n\n确保已在 Worker 设置中配置环境变量：DIDATICK_CLIENT_ID, DIDATICK_CLIENT_SECRET, DIDATICK_REDIRECT_URI, DIDATICK_SCOPES (可选)。`,
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  },
};