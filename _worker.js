export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Endpoint para subir archivos a Gemini a través del Worker (evita CORS)
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return new Response(JSON.stringify({ error: "No se proporcionó ningún archivo" }), { status: 400 });
        }

        // 1. Iniciar subida resumable en Gemini
        const initRes = await fetch(
          `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "X-Goog-Upload-Protocol": "resumable",
              "X-Goog-Upload-Command": "start",
              "X-Goog-Upload-Header-Content-Length": file.size.toString(),
              "X-Goog-Upload-Header-Content-Type": file.type || "application/octet-stream",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file: { display_name: file.name }
            })
          }
        );

        const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
        if (!uploadUrl) {
          throw new Error("No se pudo obtener la URL de subida de Gemini.");
        }

        // 2. Subir los datos del archivo a Gemini desde el Worker
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize"
          },
          body: file
        });

        const fileData = await uploadRes.json();

        return new Response(JSON.stringify({
          fileUri: fileData.file.uri,
          mimeType: file.type || "application/octet-stream"
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // Endpoint para enviar el chat a Gemini
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const { message, fileUris } = await request.json();

        const parts = [];

        // Añadir archivos
        if (fileUris && fileUris.length > 0) {
          fileUris.forEach(f => {
            parts.push({
              file_data: {
                mime_type: f.mimeType,
                file_uri: f.fileUri
              }
            });
          });
        }

        // Añadir texto
        if (message) {
          parts.push({ text: message });
        }

        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }] })
          }
        );

        return new Response(geminiResponse.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
