const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function enviarEbook({ nome, email }) {
  try {
    if (!nome || !email) {
      throw new Error("Nome e e-mail do comprador são obrigatórios.");
    }

    const nomeSeguro = escaparHtml(nome);

    const caminhoPdfConfigurado = process.env.EBOOK_PDF_PATH;

    if (!caminhoPdfConfigurado) {
      throw new Error("EBOOK_PDF_PATH não configurado.");
    }

    const caminhoPdf = path.resolve(
      __dirname,
      "..",
      caminhoPdfConfigurado
    );

    if (!fs.existsSync(caminhoPdf)) {
      throw new Error(`Arquivo do e-book não encontrado: ${caminhoPdf}`);
    }

    const pdfBuffer = fs.readFileSync(caminhoPdf);

    const { data, error } = await resend.emails.send({
      from: "Gilmara Ferreira <ebooks@gilmaraferreira.com.br>",

      to: [email],

      replyTo: "psi.gilmaraferreira@gmail.com",

      bcc: ["psi.gilmaraferreira@gmail.com"],

      subject: "Seu e-book — 30 Reflexões para Acolher o Coração",

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Seu e-book chegou 💛</h2>

          <p>Olá, ${nomeSeguro}!</p>

          <p>
            Obrigada por adquirir o e-book
            <strong>30 Reflexões para Acolher o Coração</strong>,
            da coleção <em>Um Dia de Cada Vez</em>.
          </p>

          <p>
            O seu e-book está anexado a este e-mail em formato PDF.
          </p>

          <p>
            Espero que estas reflexões possam acompanhar você
            em momentos de acolhimento, pausa e cuidado.
          </p>

          <p>
            Com carinho,<br>
            <strong>Gilmara Ferreira</strong><br>
            Psicanalista Clínica
          </p>
        </div>
      `,

      attachments: [
        {
          content: pdfBuffer,
          filename: "Um_Dia_de_Cada_Vez_Volume_I_30_Reflexoes.pdf"
        }
      ]
    });

    if (error) {
      throw new Error(
        `Erro retornado pelo Resend: ${error.message || "erro desconhecido"}`
      );
    }

    if (!data?.id) {
      throw new Error(
        "Resend não retornou um identificador válido para o e-mail."
      );
    }

    console.log("✅ E-book enviado por e-mail:", {
      email,
      resendId: data.id
    });

    return {
      success: true,
      emailId: data.id
    };
  } catch (error) {
    console.error("❌ Erro no envio do e-book:", error);
    throw error;
  }
}

module.exports = {
  enviarEbook
};