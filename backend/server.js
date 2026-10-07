require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  MercadoPagoConfig,
  Preference,
  Payment,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError
} = require("mercadopago");

const { enviarEbook } = require("./services/emailService");

const {
  criarPedido,
  buscarPedidoPorId,
  registrarPagamento,
  reservarEnvioEmail,
  liberarEnvioEmail,
  marcarEmailEnviado
} = require("./services/pedidoService");

const app = express();
const PORT = process.env.PORT || 3000;
const crypto = require("crypto");

app.use(cors());
app.use(express.json());

// Rota para verificar se a API está funcionando
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API E-books Gilmara Ferreira funcionando!"
  });
});

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const preference = new Preference(client);
const payment = new Payment(client);

app.post("/api/checkout/ebook", async (req, res) => {
  try {
        const nome = String(req.body.nome || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();

        if (!nome || !email) {
        return res.status(400).json({
            error: "Nome e e-mail são obrigatórios."
        });
        }

        if (nome.length < 2 || nome.length > 100) {
        return res.status(400).json({
            error: "Informe um nome válido."
        });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (
        email.length > 254 ||
        !emailRegex.test(email)
        ) {
        return res.status(400).json({
            error: "Informe um e-mail válido."
        });
        }

    // Gera um identificador único para o pedido
    const pedidoId = `ebook-${crypto.randomUUID()}`;

    // Primeiro registramos o pedido no nosso banco
    const pedido = criarPedido({
      id: pedidoId,
      nome,
      email,
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    console.log("📝 Pedido criado:", {
      id: pedido.id,
      email: pedido.email,
      valor: pedido.valor,
      status: pedido.status
    });

    // Depois criamos a preferência no Mercado Pago
    const body = {
      back_urls: {
        success:
          "https://gilmaraferreira.com.br/pagamento-sucesso.html",
        pending:
          "https://gilmaraferreira.com.br/pagamento-pendente.html",
        failure:
          "https://gilmaraferreira.com.br/pagamento-falhou.html"
      },

      auto_return: "approved",

      items: [
        {
          id: "ebook-30-reflexoes",
          title: "30 Reflexões para Acolher o Coração",
          quantity: 1,
          unit_price: 19.90,
          currency_id: "BRL"
        }
      ],

      payer: {
                nome,
                email,
      },

      // Liga o pagamento do Mercado Pago ao nosso pedido
      external_reference: pedidoId
    };

    const result = await preference.create({ body });

    res.status(200).json({
      pedidoId: pedido.id,
      preferenceId: result.id,
      checkoutUrl: result.init_point,
      sandboxUrl: result.sandbox_init_point
    });
  } catch (error) {
    console.error("Erro ao criar checkout:", error);

    res.status(500).json({
      error: "Não foi possível iniciar o pagamento."
    });
  }
});

// Webhook do Mercado Pago
app.post("/api/webhook/mercadopago", async (req, res) => {
  try {
    const xSignature = req.headers["x-signature"];
    const xRequestId = req.headers["x-request-id"];

    // O Mercado Pago pode enviar o ID na query string
    // ou dentro do body.
    const dataId =
      req.query["data.id"] ||
      req.body?.data?.id;

    if (!xSignature || !xRequestId || !dataId) {
      console.log("Webhook rejeitado: dados de assinatura ausentes.");
      return res.sendStatus(401);
    }

    // Valida se a notificação realmente veio do Mercado Pago
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId: String(dataId),
      secret: process.env.MP_WEBHOOK_SECRET
    });

    console.log("✅ Assinatura do webhook válida.");

    const type = req.body?.type || req.query.type;
    const paymentId =
      req.body?.data?.id ||
      req.query["data.id"];

    // Ignora notificações que não sejam de pagamento
    if (type !== "payment" || !paymentId) {
      console.log("Notificação ignorada: não é do tipo payment.");
      return res.sendStatus(200);
    }

    // Consulta o pagamento diretamente no Mercado Pago
    const paymentData = await payment.get({
      id: paymentId
    });

    console.log("Pagamento consultado:");
    console.log({
      id: paymentData.id,
      status: paymentData.status,
      external_reference: paymentData.external_reference,
      transaction_amount: paymentData.transaction_amount,
      currency_id: paymentData.currency_id
    });

    // Recupera o ID do nosso pedido
    const pedidoId = paymentData.external_reference;

    if (!pedidoId) {
      console.log("❌ Pagamento sem external_reference.");
      return res.sendStatus(200);
    }

    // Procura o pedido no nosso banco SQLite
    const pedido = buscarPedidoPorId(pedidoId);

    if (!pedido) {
      console.log(
        `❌ Pedido não encontrado no banco: ${pedidoId}`
      );
      return res.sendStatus(200);
    }

    console.log("📝 Pedido localizado:", {
      id: pedido.id,
      email: pedido.email,
      produto: pedido.produto,
      valor: pedido.valor,
      moeda: pedido.moeda,
      email_enviado: pedido.email_enviado
    });

    // Registra o pagamento e seu status no nosso banco
    // Valida o produto registrado no nosso banco
        if (pedido.produto !== "ebook-30-reflexoes") {
        console.log("❌ Produto do pedido não corresponde ao e-book.");
        return res.sendStatus(200);
        }

        // Valida o valor do pagamento em centavos,
        // evitando problemas de comparação com números decimais.
        const valorPagoCentavos = Math.round(
        Number(paymentData.transaction_amount) * 100
        );

        const valorPedidoCentavos = Math.round(
        Number(pedido.valor) * 100
        );

        if (
        !Number.isFinite(valorPagoCentavos) ||
        valorPagoCentavos !== valorPedidoCentavos
        ) {
        console.log("❌ Valor do pagamento não corresponde ao pedido.");
        return res.sendStatus(200);
        }

        // Valida a moeda
        if (paymentData.currency_id !== pedido.moeda) {
        console.log("❌ Moeda do pagamento não corresponde ao pedido.");
        return res.sendStatus(200);
        }

        // Se o pedido já estiver associado a um pagamento,
        // somente esse mesmo payment_id poderá atualizá-lo.
        if (
        pedido.payment_id &&
        String(pedido.payment_id) !== String(paymentData.id)
        ) {
        console.log(
            `❌ Pedido ${pedido.id} já está associado a outro pagamento.`
        );
        return res.sendStatus(200);
        }

        // Somente depois das validações associamos o pagamento ao pedido.
        registrarPagamento({
        pedidoId: pedido.id,
        paymentId: paymentData.id,
        status: paymentData.status
        });

        // Somente pagamento aprovado pode liberar o e-book.
        if (paymentData.status !== "approved") {
        console.log(
            `Pagamento ainda não aprovado. Status: ${paymentData.status}`
        );

        return res.sendStatus(200);
        }

    // Tenta reservar atomicamente o direito de enviar o e-book.
    // Apenas um webhook consegue mudar email_enviado de 0 para -1.
        const envioReservado = reservarEnvioEmail(pedido.id);

        if (!envioReservado) {
        const pedidoAtualizado = buscarPedidoPorId(pedido.id);

        if (pedidoAtualizado?.email_enviado === 1) {
            console.log(
            `ℹ️ E-book já enviado anteriormente para ${pedido.email}.`
            );
        } else if (pedidoAtualizado?.email_enviado === -1) {
            console.log(
            `ℹ️ Envio do e-book já está sendo processado para ${pedido.email}.`
            );
        }

        return res.sendStatus(200);
        }

        console.log("✅ PAGAMENTO APROVADO E VALIDADO");
        console.log(`🔒 Envio reservado para o pedido ${pedido.id}.`);
        console.log(`📧 Enviando e-book para ${pedido.email}...`);

        try {
        // Envia o PDF para o e-mail informado no nosso checkout
        const resultadoEmail = await enviarEbook({
            nome: pedido.nome,
            email: pedido.email
        });

        // Marca definitivamente como enviado
        marcarEmailEnviado({
            pedidoId: pedido.id,
            resendEmailId: resultadoEmail.emailId
        });

        console.log("✅ Pedido concluído:", {
            pedidoId: pedido.id,
            paymentId: paymentData.id,
            email: pedido.email,
            resendEmailId: resultadoEmail.emailId
        });

        return res.sendStatus(200);

        } catch (error) {

        // Se o Resend falhar, libera o pedido para uma nova tentativa.
        liberarEnvioEmail(pedido.id);

        console.error(
            `❌ Falha no envio do e-book. Pedido ${pedido.id} liberado para nova tentativa.`
        );

        throw error;
        }

    } catch (error) {

    if (error instanceof InvalidWebhookSignatureError) {
      console.log("❌ Assinatura do webhook inválida.");
      return res.status(401).end();
    }

    console.error("❌ Erro ao processar webhook:", error);

    // Um erro de processamento gera 500.
    // Assim não confirmamos falsamente que tudo foi concluído.
    if (!res.headersSent) {
      return res.sendStatus(500);
    }
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
});
