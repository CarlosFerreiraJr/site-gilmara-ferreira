
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  criarProcessadorOrder
} = require("../services/orderProcessingService");

const {
  criarReconciliadorOrders
} = require("../services/orderReconciliationService");

async function executarComBancoIsolado(callback) {
  const pastaTemporaria = fs.mkdtempSync(
    path.join(os.tmpdir(), "gilmara-integracao-")
  );

  const bancoTemporario = path.join(
    pastaTemporaria,
    "pedidos-teste.db"
  );

  const caminhoServico = require.resolve("../services/pedidoService");
  const bancoAnterior = process.env.PEDIDOS_DB_PATH;

  let pedidoService;

  try {
    process.env.PEDIDOS_DB_PATH = bancoTemporario;
    delete require.cache[caminhoServico];

    pedidoService = require(caminhoServico);

    return await callback(pedidoService);
  } finally {
    if (pedidoService) {
      pedidoService.fecharConexao();
    }

    delete require.cache[caminhoServico];

    if (bancoAnterior === undefined) {
      delete process.env.PEDIDOS_DB_PATH;
    } else {
      process.env.PEDIDOS_DB_PATH = bancoAnterior;
    }

    fs.rmSync(pastaTemporaria, {
      recursive: true,
      force: true
    });
  }
}


test("Reconciliação aprova pedido no SQLite e evita envio duplicado", async () => {
  await executarComBancoIsolado(async (pedidoService) => {
    const pedidoId = "pedido-integracao-001";
    const orderId = "order-integracao-001";
    const paymentId = "payment-integracao-001";

    let quantidadeEnvios = 0;
    let quantidadeConsultas = 0;

    pedidoService.criarPedido({
      id: pedidoId,
      nome: "Comprador Integração",
      email: "integracao@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    pedidoService.vincularOrderAoPedido({
      pedidoId,
      orderId
    });

    const orderData = {
      id: orderId,
      external_reference: pedidoId,
      status: "processed",
      status_detail: "accredited",
      total_paid_amount: "19.90",
      currency: "BRL",
      transactions: {
        payments: [{
          id: "transacao-integracao-001",
          reference_id: paymentId,
          status: "processed",
          status_detail: "accredited",
          paid_amount: "19.90"
        }]
      }
    };

    const processarOrderAprovada = criarProcessadorOrder({
      buscarPedidoPorId: pedidoService.buscarPedidoPorId,
      registrarOrderPagamento: pedidoService.registrarOrderPagamento,
      reservarEnvioEmail: pedidoService.reservarEnvioEmail,
      marcarEmailEnviado: pedidoService.marcarEmailEnviado,

      // Simulação: não envia e-mail real.
      enviarEbook: async ({ nome, email }) => {
        assert.equal(nome, "Comprador Integração");
        assert.equal(email, "integracao@example.com");

        quantidadeEnvios++;

        return {
          success: true,
          emailId: "resend-integracao-001"
        };
      }
    });

    const reconciliarOrders = criarReconciliadorOrders({
      buscarPedidosParaReconciliacao:
        pedidoService.buscarPedidosParaReconciliacao,

      // Simulação: não consulta o Mercado Pago.
      obterOrderValidada: async (id) => {
        quantidadeConsultas++;
        assert.equal(id, orderId);
        return orderData;
      },

      processarOrderAprovada,

      registrarPedidoEncerrado:
        pedidoService.registrarPedidoEncerrado
    });

    // Primeira reconciliação.
    const primeiroResumo = await reconciliarOrders();

    assert.equal(primeiroResumo.consultados, 1);
    assert.equal(primeiroResumo.processados, 1);
    assert.equal(primeiroResumo.erros, 0);

    const pedidoAprovado =
      pedidoService.buscarPedidoPorId(pedidoId);

    assert.equal(pedidoAprovado.status, "approved");
    assert.equal(pedidoAprovado.order_id, orderId);
    assert.equal(pedidoAprovado.payment_id, paymentId);
    assert.equal(pedidoAprovado.email_enviado, 1);
    assert.equal(
      pedidoAprovado.resend_email_id,
      "resend-integracao-001"
    );

    // Segunda reconciliação: não deve reenviar.
    const segundoResumo = await reconciliarOrders();

    assert.equal(segundoResumo.consultados, 0);
    assert.equal(segundoResumo.processados, 0);

    assert.equal(quantidadeEnvios, 1);
    assert.equal(quantidadeConsultas, 1);
  });
});


test("Falha no Resend mantém reserva no SQLite e impede reenvio", async () => {
  await executarComBancoIsolado(async (pedidoService) => {
    const pedidoId = "pedido-integracao-falha-001";
    const orderId = "order-integracao-falha-001";
    const paymentId = "payment-integracao-falha-001";

    let tentativasEnvio = 0;

    pedidoService.criarPedido({
      id: pedidoId,
      nome: "Comprador Teste Falha",
      email: "falha@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    pedidoService.vincularOrderAoPedido({
      pedidoId,
      orderId
    });

    const orderData = {
      id: orderId,
      external_reference: pedidoId,
      status: "processed",
      status_detail: "accredited",
      total_paid_amount: "19.90",
      currency: "BRL",
      transactions: {
        payments: [{
          id: "transacao-integracao-falha-001",
          reference_id: paymentId,
          status: "processed",
          status_detail: "accredited",
          paid_amount: "19.90"
        }]
      }
    };

    const processarOrderAprovada = criarProcessadorOrder({
      buscarPedidoPorId: pedidoService.buscarPedidoPorId,
      registrarOrderPagamento: pedidoService.registrarOrderPagamento,
      reservarEnvioEmail: pedidoService.reservarEnvioEmail,
      marcarEmailEnviado: pedidoService.marcarEmailEnviado,

      enviarEbook: async () => {
        tentativasEnvio++;
        throw new Error("Falha simulada no Resend");
      }
    });

    const reconciliarOrders = criarReconciliadorOrders({
      buscarPedidosParaReconciliacao:
        pedidoService.buscarPedidosParaReconciliacao,

      obterOrderValidada: async () => orderData,

      processarOrderAprovada,

      registrarPedidoEncerrado:
        pedidoService.registrarPedidoEncerrado
    });

    // Primeira reconciliação: falha simulada no envio.
    const consoleErrorOriginal = console.error;

    let primeiroResumo;

    try {
      console.error = () => {};
      primeiroResumo = await reconciliarOrders();
    } finally {
      console.error = consoleErrorOriginal;
    }

    assert.equal(primeiroResumo.consultados, 1);
    assert.equal(primeiroResumo.processados, 0);
    assert.equal(primeiroResumo.erros, 1);

    const pedidoAposFalha =
      pedidoService.buscarPedidoPorId(pedidoId);

    assert.equal(pedidoAposFalha.status, "approved");
    assert.equal(pedidoAposFalha.email_enviado, -1);
    assert.equal(tentativasEnvio, 1);

    // Segunda reconciliação: não deve tentar reenviar.
    const segundoResumo = await reconciliarOrders();

    assert.equal(segundoResumo.consultados, 0);
    assert.equal(segundoResumo.processados, 0);
    assert.equal(tentativasEnvio, 1);
  });
});


test("Reconciliação registra cancelamento no SQLite sem enviar e-book", async () => {
  await executarComBancoIsolado(async (pedidoService) => {
    const pedidoId = "pedido-integracao-cancelado-001";
    const orderId = "order-integracao-cancelada-001";

    let quantidadeEnvios = 0;

    pedidoService.criarPedido({
      id: pedidoId,
      nome: "Comprador Cancelamento",
      email: "cancelamento@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    pedidoService.vincularOrderAoPedido({
      pedidoId,
      orderId
    });

    const processarOrderAprovada = async () => {
      quantidadeEnvios++;
      throw new Error("Pedido cancelado não pode enviar e-book.");
    };

    const reconciliarOrders = criarReconciliadorOrders({
      buscarPedidosParaReconciliacao:
        pedidoService.buscarPedidosParaReconciliacao,

      obterOrderValidada: async (id) => {
        assert.equal(id, orderId);

        return {
          id: orderId,
          external_reference: pedidoId,
          status: "canceled",
          status_detail: "canceled"
        };
      },

      processarOrderAprovada,

      registrarPedidoEncerrado:
        pedidoService.registrarPedidoEncerrado
    });

    const resumo = await reconciliarOrders();

    assert.deepEqual(resumo, {
      consultados: 1,
      processados: 0,
      encerrados: 1,
      ignorados: 0,
      erros: 0
    });

    const pedidoCancelado =
      pedidoService.buscarPedidoPorId(pedidoId);

    assert.equal(pedidoCancelado.status, "canceled");
    assert.equal(pedidoCancelado.email_enviado, 0);
    assert.equal(quantidadeEnvios, 0);
  });
});
