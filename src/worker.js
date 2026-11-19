export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);

    // Serve every static stylesheet with an explicit CSS MIME type.
    // This prevents browsers from rejecting CSS when an upstream asset
    // response carries a generic or incorrect content type.
    if ((url.pathname.toLowerCase().endsWith(".css") || url.pathname.toLowerCase().endsWith(".js") || url.pathname.toLowerCase().endsWith(".html")) && response.ok) {
      const headers = new Headers(response.headers);
      headers.set("Content-Type", "text/css; charset=utf-8");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return response;
  }
};
