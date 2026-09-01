export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. CHAT (Texto -> Grok / Archivos -> Gemini)
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const hasFiles = body.fileUris && body.fileUris.length > 0;

        // --- CASO A: SI TIENE ARCHIVOS/IMÁGENES -> GEMINI ---
        if (hasFiles) {
          const geminiApiKey = env.GEMINI_API_KEY;
          if (!geminiApiKey) {
            return new Response(JSON.stringify({ error: "Falta la variable GEMINI_API_KEY en Cloudflare" }), { 
              status: 400, 
              headers: { "Content-Type": "application/json" } 
            });
          }

          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

          let parts = [{ text: body.message || "Analiza estos archivos:" }];
          body.fileUris.forEach(file => {
            parts.push({
              file_data: {
                mime_type: file.mimeType,
                file_uri: file.uri
              }
            });
          });

          const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: parts }] })
          });

          const data = await response.json();
          if (!response.ok) {
            return new Response(JSON.stringify({ error: data.error?.message || "Error en la API de Gemini" }), { 
              status: 400, 
              headers: { "Content-Type": "application/json" } 
            });
          }

          const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta de Gemini.";
          return new Response(JSON.stringify({ reply: replyText }), {
            headers: { "Content-Type": "application/json" }
          });
        }

        // --- CASO B: SOLO TEXTO -> GROK (xAI) ---
        else {
          const grokApiKey = env.GROK_API_KEY || env.XAI_API_KEY;
          if (!grokApiKey) {
            return new Response(JSON.stringify({ error: "Falta la variable GROK_API_KEY (o XAI_API_KEY) en Cloudflare" }), { 
              status: 400, 
              headers: { "Content-Type": "application/json" } 
            });
          }

          const grokUrl = "https://api.x.ai/v1/chat/completions";

          const response = await fetch(grokUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${grokApiKey}`
            },
            body: JSON.stringify({
              model: "grok-2-latest",
              messages: [
                { role: "user", content: body.message || "Hola" }
              ]
            })
          });

          const data = await response.json();
          if (!response.ok) {
            return new Response(JSON.stringify({ error: data.error?.message || "Error en la API de Grok" }), { 
              status: 400, 
              headers: { "Content-Type": "application/json" } 
            });
          }

          const replyText = data.choices?.[0]?.message?.content || "Sin respuesta de Grok.";
          return new Response(JSON.stringify({ reply: replyText }), {
            headers: { "Content-Type": "application/json" }
          });
        }

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // 2. SUBIDA DE ARCHIVOS A GEMINI
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const apiKey = env.GEMINI_API_KEY;
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return new Response(JSON.stringify({ error: "No se envió ningún archivo" }), { 
            status: 400, 
            headers: { "Content-Type": "application/json" } 
          });
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
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, 
          headers: { "Content-Type": "application/json" } 
        });
      }
    }

    // Para cualquier otra ruta que no sea de la API:
    return new Response("Not Found", { status: 404 });
  }
};
