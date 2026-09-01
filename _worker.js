  export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const apiKey = env.GEMINI_API_KEY;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

        let parts = [{ text: body.message || "" }];

        if (body.fileUris && body.fileUris.length > 0) {
          body.fileUris.forEach(file => {
            parts.push({
              file_data: {
                mime_type: file.mimeType,
                file_uri: file.uri
              }
            });
          });
        }

        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: parts }]
          })
        });

        return new Response(response.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });

      } catch (err) {
        return new Response(err.message, { status: 500 });
      }
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const apiKey = env.GEMINI_API_KEY;
        const formData = await request.formData();
        const file = formData.get("file");

        const uploadReq = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
          method: "POST",
          headers: {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": file.size,
            "X-Goog-Upload-Header-Content-Type": file.type,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ file: { display_name: file.name } })
        });

        const uploadUrl = uploadReq.headers.get("X-Goog-Upload-URL");

        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Length": file.size,
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize"
          },
          body: await file.arrayBuffer()
        });

        const data = await uploadRes.json();
        return new Response(JSON.stringify(data.file), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
