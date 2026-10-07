require("dotenv").config();

const express = require("express");
const {
  MercadoPagoConfig,
  Preference,
  Payment,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
  Order
} = require("mercadopago");

const { enviarEbook } = require("./services/emailService");

const {
  criarPedido,
  buscarPedidoPorId,
  registrarPagamento,
  registrarOrderPagamento,
  reservarEnvioEmail,
  liberarEnvioEmail,
  marcarEmailEnviado
} = require("./services/pedidoService");

const app = express();
const PORT = process.env.PORT || 3000;
const crypto = require("crypto");

app.use(express.json());

// Rota para verificar se a API está funcionando
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API E-books Gilmara Ferreira funcionando!"
  });
});

// Consulta pública e limitada do status de um pedido
app.get("/api/pedidos/:id/status", (req, res) => {
  try {
    const pedidoId = String(req.params.id || "").trim();

    if (!pedidoId) {
      return res.status(400).json({
        error: "Pedido inválido."
      });
    }

    const pedido = buscarPedidoPorId(pedidoId);

    if (!pedido) {
      return res.status(404).json({
        error: "Pedido não encontrado."
      });
    }

    return res.status(200).json({
      status: pedido.status,
      emailEnviado: pedido.email_enviado === 1
    });
  } catch (error) {
    console.error("Erro ao consultar status do pedido:", error);

    return res.status(500).json({
      error: "Não foi possível consultar o status do pedido."
    });
  }
});

const mercadoPagoConfig = {
  accessToken: process.env.MP_ACCESS_TOKEN
};

if (process.env.MP_TEST_MODE === "true") {
  mercadoPagoConfig.options = {
    testToken: true
  };
}

const client = new MercadoPagoConfig(mercadoPagoConfig);

const preference = new Preference(client);
const payment = new Payment(client);
const order = new Order(client);

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

app.post("/api/checkout/ebook-order", async (req, res) => {
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

    if (email.length > 254 || !emailRegex.test(email)) {
      return res.status(400).json({
        error: "Informe um e-mail válido."
      });
    }

    const pedidoId = `ebook-${crypto.randomUUID()}`;

    const pedido = criarPedido({
    id: pedidoId,
    nome,
    email,
    produto: "ebook-30-reflexoes",
    valor: 19.90,
    moeda: "BRL"
    });

    console.log("📝 Pedido para Order criado:", {
    id: pedido.id,
    email: pedido.email,
    valor: pedido.valor,
    status: pedido.status
    });

const idempotencyKey = crypto.randomUUID();

const body = {
  type: "online",
  processing_mode: "manual",
  total_amount: "19.90",
  external_reference: pedido.id,

  payer: {
    email
  },

  items: [
    {
      title: "Um Dia de Cada Vez - Volume I - 30 Reflexões",
      unit_price: "19.90",
      quantity: 1
    }
  ],

  config: {
    online: {
      success_url:
        "https://gilmaraferreira.com.br/pagamento-sucesso.html",

      pending_url:
        "https://gilmaraferreira.com.br/pagamento-pendente.html",

      failure_url:
        "https://gilmaraferreira.com.br/pagamento-falhou.html",

      auto_return: "approved"
    }
  }
};

    console.log("📦 Criando Order no Mercado Pago:", {
    pedidoId: pedido.id,
    valor: body.total_amount,
    email
    });

    const result = await order.create({
    body,
    requestOptions: {
        idempotencyKey
    }
    });

    console.log("✅ Order criada no Mercado Pago:", {
    id: result.id,
    status: result.status,
    external_reference: result.external_reference
    });

    return res.status(200).json({
    pedidoId: pedido.id,
    orderId: result.id,
    checkoutUrl: result.checkout_url
    });


  } catch (error) {
    console.error("Erro ao criar checkout por Order:", error);

    return res.status(500).json({
      error: "Não foi possível iniciar o pagamento."
    });
  }
});

async function consultarOrderMercadoPago(orderId) {
  const orderData = await order.get({
    id: orderId
  });

  console.log("📦 Order consultada no Mercado Pago:");
  console.log({
    id: orderData.id,
    status: orderData.status,
    status_detail: orderData.status_detail,
    external_reference: orderData.external_reference,
    total_amount: orderData.total_amount,
    total_paid_amount: orderData.total_paid_amount,
    currency: orderData.currency
  });

  return orderData;
}

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
    // Orders usam data.id alfanumérico e precisam ser validadas
    // com o identificador em letras minúsculas.
    const webhookType = req.body?.type || req.query.type;

    const dataIdParaValidacao =
      webhookType === "order"
        ? String(dataId).toLowerCase()
        : String(dataId);

     WebhookSignatureValidator.validate({
       xSignature,
       xRequestId,
       dataId: dataIdParaValidacao,
       secret: process.env.MP_WEBHOOK_SECRET
    });

    console.log("✅ Assinatura do webhook válida.");

    const type = req.body?.type || req.query.type;
    const resourceId =
    req.body?.data?.id ||
    req.query["data.id"];

    // ========================================
    // ORDERS API
    // ========================================
    if (type === "order") {
    console.log("📦 Notificação de Order recebida:", {
        action: req.body?.action,
        orderId: resourceId,
        external_reference: req.body?.data?.external_reference,
        status: req.body?.data?.status,
        status_detail: req.body?.data?.status_detail
    });

    if (!resourceId) {
        console.log("❌ Notificação de Order sem ID.");
        return res.sendStatus(200);
    }

    const orderData = await consultarOrderMercadoPago(resourceId);

    console.log("✅ Order obtida e pronta para validação:", {
        id: orderData.id,
        external_reference: orderData.external_reference,
        status: orderData.status,
        status_detail: orderData.status_detail
    });

        if (
            orderData.status !== "processed" ||
            orderData.status_detail !== "accredited"
            ) {
            console.log(
                `Order ainda não aprovada. Status: ${orderData.status} / ${orderData.status_detail}`
            );

            return res.sendStatus(200);
        }

        console.log("✅ ORDER APROVADA NO MERCADO PAGO");

        const pedidoId = orderData.external_reference;

        if (!pedidoId) {
        console.log("❌ Order sem external_reference.");
        return res.sendStatus(200);
        }

        const pedido = buscarPedidoPorId(pedidoId);

        if (!pedido) {
        console.log(`❌ Pedido não encontrado no banco: ${pedidoId}`);
        return res.sendStatus(200);
        }

        console.log("📝 Pedido da Order localizado:", {
        id: pedido.id,
        email: pedido.email,
        produto: pedido.produto,
        valor: pedido.valor,
        moeda: pedido.moeda,
        email_enviado: pedido.email_enviado
        });

        // Valida o produto registrado no nosso banco
        if (pedido.produto !== "ebook-30-reflexoes") {
        console.log("❌ Produto do pedido não corresponde ao e-book.");
        return res.sendStatus(200);
        }

        // Valida o valor efetivamente pago na Order
        const valorPagoCentavos = Math.round(
        Number(orderData.total_paid_amount) * 100
        );

        const valorPedidoCentavos = Math.round(
        Number(pedido.valor) * 100
        );

        if (
        !Number.isFinite(valorPagoCentavos) ||
        valorPagoCentavos !== valorPedidoCentavos
        ) {
        console.log("❌ Valor pago na Order não corresponde ao pedido.");
        return res.sendStatus(200);
        }

        // Valida a moeda
        if (orderData.currency !== pedido.moeda) {
        console.log("❌ Moeda da Order não corresponde ao pedido.");
        return res.sendStatus(200);
        }

        console.log("✅ PRODUTO, VALOR E MOEDA DA ORDER VALIDADOS");

        const pagamentosOrder = orderData.transactions?.payments || [];

        const orderPayment = pagamentosOrder.find((pagamento) => {
        const valorPagamentoCentavos = Math.round(
            Number(pagamento.paid_amount) * 100
        );

        return (
            pagamento.status === "processed" &&
            pagamento.status_detail === "accredited" &&
            Number.isFinite(valorPagamentoCentavos) &&
            valorPagamentoCentavos === valorPedidoCentavos &&
            pagamento.reference_id
        );
        });

        if (!orderPayment?.id) {
        console.log("❌ Nenhuma transação aprovada encontrada na Order.");
        return res.sendStatus(200);
        }

        console.log("💳 Transação da Order validada:", {
        id: orderPayment.id,
        status: orderPayment.status,
        status_detail: orderPayment.status_detail,
        paid_amount: orderPayment.paid_amount
        });

        const valorTransacaoCentavos = Math.round(
             Number(orderPayment.paid_amount) * 100
        );

        if (
        !Number.isFinite(valorTransacaoCentavos) ||
        valorTransacaoCentavos !== valorPedidoCentavos
        ) {
        console.log("❌ Valor da transação aprovada não corresponde ao pedido.");
        return res.sendStatus(200);
        }

        console.log("✅ VALOR DA TRANSAÇÃO DA ORDER VALIDADO");

        if (!orderPayment.reference_id) {
        console.error("❌ Payment da Order sem reference_id:", {
            orderId: orderData.id,
            transactionId: orderPayment.id
        });

        return res.sendStatus(200);
        }

        const pedidoAtualizado = registrarOrderPagamento({
        pedidoId: pedido.id,
        orderId: orderData.id,
        paymentId: orderPayment.reference_id,
        status: "approved"
        });

        console.log("💾 Order e pagamento registrados no pedido:", {
        pedidoId: pedidoAtualizado.id,
        orderId: pedidoAtualizado.order_id,
        paymentId: pedidoAtualizado.payment_id,
        status: pedidoAtualizado.status,
        email_enviado: pedidoAtualizado.email_enviado
        });

        const envioReservado = reservarEnvioEmail(pedidoAtualizado.id);

        if (!envioReservado) {
        const pedidoExistente = buscarPedidoPorId(pedidoAtualizado.id);

        console.log("ℹ️ Envio não reservado:", {
            pedidoId: pedidoExistente.id,
            email_enviado: pedidoExistente.email_enviado
        });

        return res.sendStatus(200);
        }

        console.log("🔒 ENVIO DO E-BOOK RESERVADO");

        try {
        console.log("📧 Enviando e-book:", {
            pedidoId: pedidoAtualizado.id,
            email: pedidoAtualizado.email
        });

        const resultadoEmail = await enviarEbook({
            nome: pedidoAtualizado.nome,
            email: pedidoAtualizado.email
        });

        marcarEmailEnviado({
        pedidoId: pedidoAtualizado.id,
        resendEmailId: resultadoEmail.emailId
        });

        console.log("✅ E-book enviado por e-mail:", {
            pedidoId: pedidoAtualizado.id,
            resendEmailId: resultadoEmail.emailId
        });

        return res.sendStatus(200);

        } catch (emailError) {
        liberarEnvioEmail(pedidoAtualizado.id);

        console.error(
            "❌ Falha ao enviar o e-book. Reserva liberada:",
            emailError
        );

        throw emailError;
        }
    }

    // ========================================
    // PAYMENT - FLUXO ATUAL DE PRODUÇÃO
    // ========================================
    if (type !== "payment" || !resourceId) {
    console.log(`Notificação ignorada. Tipo recebido: ${type}`);
    return res.sendStatus(200);
    }

    const paymentId = resourceId;

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

        console.log("✅ E-book enviado por e-mail:", {
        pedidoId: pedido.id,
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
