export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const userMessage = body.message;

    if (!userMessage || typeof userMessage !== "string") {
      return new Response(
        JSON.stringify({ error: "Falta el mensaje" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const apiKey = context.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "No se encontró GEMINI_API_KEY en Cloudflare" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: userMessage
                }
              ]
            }
          ]
        })
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "Gemini ha devuelto un error",
          details: data
        }),
        {
          status: geminiResponse.status,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return new Response(
        JSON.stringify({
          error: "Gemini no ha devuelto ninguna respuesta",
          details: data
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({ reply }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Error interno",
        details: error instanceof Error
          ? error.message
          : String(error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
