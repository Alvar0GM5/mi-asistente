<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mi Asistente</title>

    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #111;
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }

        .contenedor {
            width: 90%;
            max-width: 800px;
            text-align: center;
        }

        h1 {
            font-size: 42px;
            margin-bottom: 10px;
        }

        p {
            color: #aaa;
            margin-bottom: 30px;
        }

        .chat {
            background: #1c1c1c;
            border-radius: 15px;
            padding: 20px;
            min-height: 300px;
            text-align: left;
        }

        .entrada {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }

        input {
            flex: 1;
            padding: 15px;
            border-radius: 10px;
            border: none;
            background: #292929;
            color: white;
            font-size: 16px;
        }

        button {
            padding: 15px 25px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 16px;
        }

        button:hover {
            opacity: 0.8;
        }
    </style>
</head>

<body>

    <div class="contenedor">

        <h1>Mi Asistente</h1>

        <p>Tu asistente personal</p>

        <div class="chat">
            <div id="mensajes">
                <p>El sistema está preparado.</p>
            </div>

            <div class="entrada">
                <input
                    type="text"
                    id="mensaje"
                    placeholder="Escribe algo..."
                >

                <button onclick="enviarMensaje()">
                    Enviar
                </button>
            </div>
        </div>

    </div>

    <script>
        function enviarMensaje() {
            const entrada = document.getElementById("mensaje");
            const mensajes = document.getElementById("mensajes");

            if (entrada.value.trim() === "") {
                return;
            }

            const nuevoMensaje = document.createElement("p");
            nuevoMensaje.textContent = "Tú: " + entrada.value;

            mensajes.appendChild(nuevoMensaje);

            entrada.value = "";
        }
    </script>

</body>
</html>
