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
    const groqKey = env.GROQ_API_KEY;

    // Endpoint 1: Subida de archivos pesados a Gemini
    if (url.pathname === "/api/upload") {
      if (request.method === "POST") {
        try {
          if (!apiKey) {
            return new Response("Error: GEMINI_API_KEY no configurada.", { status: 400, headers: corsHeaders });
          }

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

          if (!initRes.ok) {
            const errBody = await initRes.text();
            return new Response(`Error al iniciar subida: ${errBody}`, { status: initRes.status, headers: corsHeaders });
          }

          const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
          return new Response(JSON.stringify({ uploadUrl }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        } catch (err) {
          return new Response(`Error en /api/upload: ${err.message}`, { status: 500, headers: corsHeaders });
        }
      }
    }

    // Endpoint 2: Chat con fallback automático a Groq API
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

          // Intentar primero con Gemini
          if (apiKey) {
            const geminiResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: parts }] })
              }
            );

            // Si Gemini responde correctamente, devolvemos su flujo
            if (geminiResponse.ok) {
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
            }
          }

          // Si Gemini falla (p. ej. error 429 por cuota) y tenemos clave de Groq, usamos Groq como respaldo
          if (groqKey) {
            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${groqKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: body.message || "Responde al usuario." }]
              })
            });

            if (groqRes.ok) {
              const groqData = await groqRes.json();
              const replyText = groqData.choices?.[0]?.message?.content || "Sin respuesta.";

              // Formateamos la respuesta para que la interfaz la lea sin errores
              const sseFormatted = `data: ${JSON.stringify({
                candidates: [{ content: { parts: [{ text: replyText }] } }]
              })}\n\ndata: [DONE]\n\n`;

              return new Response(sseFormatted, {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  ...corsHeaders
                }
              });
            }
          }

          return new Response("Ambas API (Gemini y Groq) han alcanzado su límite o fallado.", {
            status: 429,
            headers: corsHeaders
          });

        } catch (err) {
          return new Response(`Error en el servidor: ${err.message}`, { status: 500, headers: corsHeaders });
        }
      }
    }

    return env.ASSETS.fetch(request);
  }
};
