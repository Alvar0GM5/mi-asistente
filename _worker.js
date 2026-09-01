export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Endpoint para enviar mensajes
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const apiKey = env.GEMINI_API_KEY;

        if (!apiKey) {
          return new Response(JSON.stringify({ error: "Falta la variable GEMINI_API_KEY en Cloudflare" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Modelo actualizado a gemini-1.5-flash-latest
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        let parts = [{ text: body.message || "Hola" }];

        // Si vienen archivos adjuntos
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

        const data = await response.json();

        if (!response.ok) {
          return new Response(JSON.stringify({ error: data.error?.message || "Error en la API de Gemini" }), {
            status: response.status,
            headers: { "Content-Type": "application/json" }
          });
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta recibida del modelo.";

        return new Response(JSON.stringify({ reply: replyText }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Endpoint para subir archivos
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const apiKey = env.GEMINI_API_KEY;
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return new Response(JSON.stringify({ error: "No se envió ningún archivo" }), { status: 400 });
        }

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

    // Servir la web estática si no es una ruta API
    return env.ASSETS.fetch(request);
  }
};
