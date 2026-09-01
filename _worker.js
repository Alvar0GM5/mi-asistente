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

    // Endpoint 1: Subida de archivos a Gemini
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

    // Endpoint 2: Chat
    if (url.pathname === "/api/chat") {
      if (request.method === "POST") {
        try {
          const body = await request.json();
          const hasFiles = body.fileUris && Array.isArray(body.fileUris) && body.fileUris.length > 0;

          if (!groqKey && !apiKey) {
            return new Response("Error: No se han encontrado variables de entorno GROQ_API_KEY ni GEMINI_API_KEY.", { status: 500, headers: corsHeaders });
          }

          // 1. Si es solo texto y tenemos Groq, probamos con llama-3.3-70b-versatile
          if (!hasFiles && groqKey) {
            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${groqKey.trim()}`,
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
              const groqErrText = await groqRes.text();
              return new Response(`Groq Error (${groqRes.status}): ${groqErrText}`, { status: 500, headers: corsHeaders });
            }
          }

          // 2. Si contiene archivos o no hay clave de Groq, enviamos a Gemini
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
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${apiKey.trim()}`,
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
              const geminiErrText = await geminiResponse.text();
              return new Response(`Gemini Error (${geminiResponse.status}): ${geminiErrText}`, { status: 500, headers: corsHeaders });
            }
          }

          return new Response("No se configuró ninguna API disponible.", { status: 500, headers: corsHeaders });

        } catch (err) {
          return new Response(`Error interno: ${err.message}`, { status: 500, headers: corsHeaders });
        }
      }
    }

    return env.ASSETS.fetch(request);
  }
};
