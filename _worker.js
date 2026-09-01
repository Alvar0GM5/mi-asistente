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

    // Endpoint 1: Subida de archivos
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
            return new Response(`Error al iniciar subida en Gemini: ${errBody}`, { status: initRes.status, headers: corsHeaders });
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

    // Endpoint 2: Chat con Diagnóstico
    if (url.pathname === "/api/chat") {
      if (request.method === "POST") {
        try {
          const body = await request.json();
          const hasFiles = body.fileUris && Array.isArray(body.fileUris) && body.fileUris.length > 0;

          let groqErrorLog = "";
          let geminiErrorLog = "";

          // Comprobar presencia de claves
          if (!groqKey && !hasFiles) {
            groqErrorLog = "La variable GROQ_API_KEY no existe en env. ";
          }
          if (!apiKey && hasFiles) {
            geminiErrorLog = "La variable GEMINI_API_KEY no existe en env. ";
          }

          // 1. Probar Groq si es texto
          if (!hasFiles && groqKey) {
            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${groqKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: body.message || "Hola" }]
              })
            });

            if (groqRes.ok) {
              const groqData = await groqRes.json();
              const replyText = groqData.choices?.[0]?.message?.content || "Sin respuesta.";

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
            } else {
              const errBody = await groqRes.text();
              groqErrorLog = `Groq devolvió estado ${groqRes.status}: ${errBody}`;
            }
          }

          // 2. Probar Gemini
          if (apiKey) {
            const parts = [];
            if (body.message) parts.push({ text: body.message });

            if (hasFiles) {
              for (const file of body.fileUris) {
                parts.push({
                  fileData: {
                    mimeType: file.mimeType,
                    fileUri: file.fileUri
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
            } else {
              const errBody = await geminiResponse.text();
              geminiErrorLog = `Gemini devolvió estado ${geminiResponse.status}: ${errBody}`;
            }
          }

          // Devolver el diagnóstico exacto en pantalla
          const fullDiagnostics = `Detalles del error:\n- Groq: ${groqErrorLog || "No ejecutado"}\n- Gemini: ${geminiErrorLog || "No ejecutado"}`;
          return new Response(fullDiagnostics, { status: 500, headers: corsHeaders });

        } catch (err) {
          return new Response(`Error interno del servidor: ${err.message}`, { status: 500, headers: corsHeaders });
        }
      }
    }

    return env.ASSETS.fetch(request);
  }
};
