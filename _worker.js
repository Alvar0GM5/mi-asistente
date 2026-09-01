export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Goog-Upload-Protocol, X-Goog-Upload-Command, X-Goog-Upload-Header-Content-Length, X-Goog-Upload-Header-Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response("Error: GEMINI_API_KEY no configurada.", { status: 400, headers: corsHeaders });
    }

    // Endpoint 1: Iniciar subida directa de archivos a Gemini
    if (url.pathname === "/api/upload") {
      if (request.method === "POST") {
        try {
          const { mimeType, numBytes, displayName } = await request.json();

          const initRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
            {
              method: "POST",
              headers: {
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": numBytes.toString(),
                "X-Goog-Upload-Header-Content-Type": mimeType,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ file: { display_name: displayName } })
            }
          );

          const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
          if (!uploadUrl) {
            return new Response("Error al obtener la URL de subida.", { status: 500, headers: corsHeaders });
          }

          return new Response(JSON.stringify({ uploadUrl }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        } catch (err) {
          return new Response(`Error en /api/upload: ${err.message}`, { status: 500, headers: corsHeaders });
        }
      }
    }

    // Endpoint 2: Chat con streaming ultra-rápido usando gemini-3.6-flash
    if (url.pathname === "/api/chat") {
      if (request.method === "POST") {
        try {
          const body = await request.json();
          const parts = [];

          if (body.message) {
            parts.push({ text: body.message });
          }

          if (body.fileUris && Array.isArray(body.fileUris)) {
            for (const file of body.fileUris) {
              parts.push({
                fileData: {
                  mimeType: file.mimeType,
                  fileUri: file.fileUri
                }
              });
            }
          }

          if (parts.length === 0) {
            return new Response("Error: No se envió contenido.", { status: 400, headers: corsHeaders });
          }

          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: parts }] })
            }
          );

          if (!geminiResponse.ok) {
            const errText = await geminiResponse.text();
            return new Response(`Error de la API de Gemini: ${errText}`, {
              status: geminiResponse.status,
              headers: corsHeaders
            });
          }

          const { readable, writable } = new TransformStream();
          geminiResponse.body.pipeTo(writable);

          return new Response(readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              ...corsHeaders
            }
          });
        } catch (err) {
          return new Response(`Error en el servidor: ${err.message}`, { status: 500, headers: corsHeaders });
        }
      }
    }

    return env.ASSETS.fetch(request);
  }
};
