export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);

    // Serve every static stylesheet with an explicit CSS MIME type.
    // This prevents browsers from rejecting CSS when an upstream asset
    // response carries a generic or incorrect content type.
    if (url.pathname.toLowerCase().endsWith(".css") && response.ok) {
      const headers = new Headers(response.headers);
      headers.set("Content-Type", "text/css; charset=utf-8");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "no-cache, must-revalidate");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return response;
  }
};
