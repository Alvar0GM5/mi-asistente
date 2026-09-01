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

          const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: body.message }] }] })
          });

          const data = await geminiResponse.json();
          const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No hay respuesta.";

          return new Response(JSON.stringify({ reply: aiReply }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }
      }
    }

    // Si no es la API, sirve los archivos estáticos (index.html)
    return env.ASSETS.fetch(request);
  }
};
