export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      };

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method === "POST") {
        try {
          const body = await request.json();
          const apiKey = env.GEMINI_API_KEY;

          if (!apiKey) {
            return new Response("Error: GEMINI_API_KEY no configurada.", { status: 400, headers: corsHeaders });
          }

          // Construcción de la lista de partes (texto + archivos adjuntos)
          const parts = [];

          if (body.message) {
            parts.push({ text: body.message });
          }

          // Procesar archivos adjuntos codificados en Base64 (imágenes, documentos, audios, vídeos pequeños)
          if (body.files && Array.isArray(body.files)) {
            for (const file of body.files) {
              parts.push({
                inlineData: {
                  mimeType: file.mimeType,
                  data: file.base64Data
                }
              });
            }
          }

          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: parts }] })
            }
          );

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
          return new Response(`Error: ${err.message}`, { status: 500, headers: corsHeaders });
        }
      }
    }

    return env.ASSETS.fetch(request);
  }
};
