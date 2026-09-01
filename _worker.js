export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Captura la petición a /api/chat
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

          // 1. Comprueba si existe la API Key en Cloudflare
          if (!apiKey) {
            return new Response(
              JSON.stringify({ reply: "Error: La variable GEMINI_API_KEY no está configurada en los ajustes de Cloudflare." }),
              { headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }

          // 2. Llamada a la API de Google Gemini
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: body.message }] }] })
            }
          );

          const data = await geminiResponse.json();

          // 3. Captura el mensaje de error que devuelve Google (si falla la clave o el modelo)
          if (data.error) {
            return new Response(
              JSON.stringify({ reply: `Error de Google Gemini: ${data.error.message}` }),
              { headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }

          // 4. Obtiene el texto generado o muestra aviso si vino vacío
          const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Google no devolvió ningún texto en la respuesta.";

          return new Response(JSON.stringify({ reply: aiReply }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ reply: `Error en el Worker: ${err.message}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }
    }

    // Si no es la API, sirve los archivos estáticos (index.html)
    return env.ASSETS.fetch(request);
  }
};
