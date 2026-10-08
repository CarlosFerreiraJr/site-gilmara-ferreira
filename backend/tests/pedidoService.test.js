
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Executa cada teste com seu próprio banco SQLite temporário.
function executarComBancoIsolado(callback) {
  const pastaTemporaria = fs.mkdtempSync(
    path.join(os.tmpdir(), "gilmara-pedidos-")
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

    return callback(pedidoService);
  } finally {
    // Fecha a conexão antes de excluir o banco temporário.
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

test("Pedido pendente pode ser vinculado a uma Order e aprovado", () => {
  executarComBancoIsolado(({
    criarPedido,
    buscarPedidoPorId,
    vincularOrderAoPedido,
    registrarOrderPagamento
  }) => {
    const pedidoId = "pedido-teste-001";
    const orderId = "order-teste-001";
    const paymentId = "payment-teste-001";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    const pedidoInicial = buscarPedidoPorId(pedidoId);

    assert.equal(pedidoInicial.status, "pending");

    vincularOrderAoPedido({
      pedidoId,
      orderId
    });

    registrarOrderPagamento({
      pedidoId,
      orderId,
      paymentId,
      status: "approved"
    });

    const pedidoFinal = buscarPedidoPorId(pedidoId);

    assert.equal(pedidoFinal.status, "approved");
    assert.equal(pedidoFinal.order_id, orderId);
    assert.equal(pedidoFinal.payment_id, paymentId);
    assert.equal(pedidoFinal.email_enviado, 0);
  });
});

test("Pedido aprovado não pode ser cancelado posteriormente", () => {
  executarComBancoIsolado(({
    criarPedido,
    vincularOrderAoPedido,
    registrarOrderPagamento,
    registrarPedidoEncerrado,
    buscarPedidoPorId
  }) => {
    const pedidoId = "pedido-teste-002";
    const orderId = "order-teste-002";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste2@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    vincularOrderAoPedido({
      pedidoId,
      orderId
    });

    registrarOrderPagamento({
      pedidoId,
      orderId,
      paymentId: "payment-teste-002",
      status: "approved"
    });

    const atualizado = registrarPedidoEncerrado({
      pedidoId,
      status: "canceled"
    });

    const pedidoFinal = buscarPedidoPorId(pedidoId);

    assert.equal(atualizado, false);
    assert.equal(pedidoFinal.status, "approved");
  });
});

test("Pedido cancelado pode receber aprovação válida posteriormente", () => {
  executarComBancoIsolado(({
    criarPedido,
    vincularOrderAoPedido,
    registrarPedidoEncerrado,
    registrarOrderPagamento,
    buscarPedidoPorId
  }) => {
    const pedidoId = "pedido-teste-003";
    const orderId = "order-teste-003";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste3@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    vincularOrderAoPedido({ pedidoId, orderId });

    const cancelado = registrarPedidoEncerrado({
      pedidoId,
      status: "canceled"
    });

    assert.equal(cancelado, true);
    assert.equal(buscarPedidoPorId(pedidoId).status, "canceled");

    registrarOrderPagamento({
      pedidoId,
      orderId,
      paymentId: "payment-teste-003",
      status: "approved"
    });

    const pedidoFinal = buscarPedidoPorId(pedidoId);

    assert.equal(pedidoFinal.status, "approved");
    assert.equal(pedidoFinal.payment_id, "payment-teste-003");
    assert.equal(pedidoFinal.email_enviado, 0);
  });
});

test("Order diferente não pode aprovar o pedido", () => {
  executarComBancoIsolado(({
    criarPedido,
    vincularOrderAoPedido,
    registrarOrderPagamento,
    buscarPedidoPorId
  }) => {
    const pedidoId = "pedido-teste-004";
    const orderId = "order-correta-004";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste4@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    vincularOrderAoPedido({
      pedidoId,
      orderId
    });

    assert.throws(() => {
      registrarOrderPagamento({
        pedidoId,
        orderId: "order-incorreta-004",
        paymentId: "payment-teste-004",
        status: "approved"
      });
    });

    const pedidoFinal = buscarPedidoPorId(pedidoId);

    assert.equal(pedidoFinal.status, "pending");
    assert.equal(pedidoFinal.payment_id, null);
    assert.equal(pedidoFinal.order_id, orderId);
  });
});

test("Notificações repetidas não podem reservar dois envios", () => {
  executarComBancoIsolado(({
    criarPedido,
    vincularOrderAoPedido,
    registrarOrderPagamento,
    reservarEnvioEmail,
    marcarEmailEnviado,
    buscarPedidoPorId
  }) => {
    const pedidoId = "pedido-teste-005";
    const orderId = "order-teste-005";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste5@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    vincularOrderAoPedido({ pedidoId, orderId });

    registrarOrderPagamento({
      pedidoId,
      orderId,
      paymentId: "payment-teste-005",
      status: "approved"
    });

    // Primeira notificação: consegue reservar o envio.
    const primeiraReserva = reservarEnvioEmail(pedidoId);

    // Segunda notificação: não consegue reservar novamente.
    const segundaReserva = reservarEnvioEmail(pedidoId);

    assert.equal(primeiraReserva, true);
    assert.equal(segundaReserva, false);

    marcarEmailEnviado({
      pedidoId,
      resendEmailId: "resend-teste-005"
    });

    // Mesmo após o envio, uma nova reserva deve ser rejeitada.
    const terceiraReserva = reservarEnvioEmail(pedidoId);

    assert.equal(terceiraReserva, false);

    const pedidoFinal = buscarPedidoPorId(pedidoId);

    assert.equal(pedidoFinal.email_enviado, 1);
  });
});


test("Falha no envio permite uma nova tentativa", () => {
  executarComBancoIsolado(({
    criarPedido,
    vincularOrderAoPedido,
    registrarOrderPagamento,
    reservarEnvioEmail,
    liberarEnvioEmail,
    buscarPedidoPorId
  }) => {
    const pedidoId = "pedido-teste-006";
    const orderId = "order-teste-006";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste6@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    vincularOrderAoPedido({ pedidoId, orderId });

    registrarOrderPagamento({
      pedidoId,
      orderId,
      paymentId: "payment-teste-006",
      status: "approved"
    });

    // Primeira tentativa de envio.
    assert.equal(reservarEnvioEmail(pedidoId), true);
    assert.equal(buscarPedidoPorId(pedidoId).email_enviado, -1);

    // Simula uma falha do serviço de e-mail.
    liberarEnvioEmail(pedidoId);

    assert.equal(buscarPedidoPorId(pedidoId).email_enviado, 0);

    // Uma nova tentativa deve ser permitida.
    assert.equal(reservarEnvioEmail(pedidoId), true);
    assert.equal(buscarPedidoPorId(pedidoId).email_enviado, -1);
  });
});


test("Pedido sem Order vinculada não pode ser aprovado", () => {
  executarComBancoIsolado(({
    criarPedido,
    registrarOrderPagamento,
    buscarPedidoPorId
  }) => {
    const pedidoId = "pedido-teste-007";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste7@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    // Simula uma notificação recebida antes do vínculo da Order.
    assert.throws(() => {
      registrarOrderPagamento({
        pedidoId,
        orderId: "order-teste-007",
        paymentId: "payment-teste-007",
        status: "approved"
      });
    });

    const pedidoFinal = buscarPedidoPorId(pedidoId);

    assert.equal(pedidoFinal.status, "pending");
    assert.equal(pedidoFinal.order_id, null);
    assert.equal(pedidoFinal.payment_id, null);
    assert.equal(pedidoFinal.email_enviado, 0);
  });
});


test("Pedido pendente não pode reservar envio de e-mail", () => {
  executarComBancoIsolado(({
    criarPedido,
    reservarEnvioEmail,
    buscarPedidoPorId
  }) => {
    const pedidoId = "pedido-teste-008";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste8@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    const reserva = reservarEnvioEmail(pedidoId);

    assert.equal(reserva, false);

    const pedidoFinal = buscarPedidoPorId(pedidoId);

    assert.equal(pedidoFinal.status, "pending");
    assert.equal(pedidoFinal.email_enviado, 0);
  });
});


test("Não pode confirmar envio sem reserva ativa", () => {
  executarComBancoIsolado(({
    criarPedido,
    vincularOrderAoPedido,
    registrarOrderPagamento,
    marcarEmailEnviado,
    buscarPedidoPorId
  }) => {
    const pedidoId = "pedido-teste-009";
    const orderId = "order-teste-009";

    criarPedido({
      id: pedidoId,
      nome: "Comprador Teste",
      email: "teste9@example.com",
      produto: "ebook-30-reflexoes",
      valor: 19.90,
      moeda: "BRL"
    });

    vincularOrderAoPedido({ pedidoId, orderId });

    registrarOrderPagamento({
      pedidoId,
      orderId,
      paymentId: "payment-teste-009",
      status: "approved"
    });

    // Tenta confirmar o envio sem reservar primeiro.
    assert.throws(() => {
      marcarEmailEnviado({
        pedidoId,
        resendEmailId: "resend-teste-009"
      });
    });

    const pedidoFinal = buscarPedidoPorId(pedidoId);

    assert.equal(pedidoFinal.status, "approved");
    assert.equal(pedidoFinal.email_enviado, 0);
    assert.equal(pedidoFinal.resend_email_id, null);
  });
});


test("Reconciliação seleciona somente Orders sem envio concluído", () => {
  executarComBancoIsolado(({
    criarPedido,
    vincularOrderAoPedido,
    registrarOrderPagamento,
    reservarEnvioEmail,
    marcarEmailEnviado,
    buscarPedidosParaReconciliacao
  }) => {
    function novoPedido(id) {
      criarPedido({
        id,
        nome: "Comprador Teste",
        email: `${id}@example.com`,
        produto: "ebook-30-reflexoes",
        valor: 19.90,
        moeda: "BRL"
      });
    }

    novoPedido("pedido-pendente");
    vincularOrderAoPedido({
      pedidoId: "pedido-pendente",
      orderId: "order-pendente"
    });

    novoPedido("pedido-aprovado");
    vincularOrderAoPedido({
      pedidoId: "pedido-aprovado",
      orderId: "order-aprovado"
    });
    registrarOrderPagamento({
      pedidoId: "pedido-aprovado",
      orderId: "order-aprovado",
      paymentId: "payment-aprovado",
      status: "approved"
    });

    novoPedido("pedido-enviado");
    vincularOrderAoPedido({
      pedidoId: "pedido-enviado",
      orderId: "order-enviado"
    });
    registrarOrderPagamento({
      pedidoId: "pedido-enviado",
      orderId: "order-enviado",
      paymentId: "payment-enviado",
      status: "approved"
    });
    assert.equal(reservarEnvioEmail("pedido-enviado"), true);
    marcarEmailEnviado({
      pedidoId: "pedido-enviado",
      resendEmailId: "resend-enviado"
    });

    novoPedido("pedido-sem-order");

    const pedidos = buscarPedidosParaReconciliacao();
    const ids = pedidos.map((pedido) => pedido.id);

    assert.equal(ids.length, 2);
    assert.ok(ids.includes("pedido-pendente"));
    assert.ok(ids.includes("pedido-aprovado"));
    assert.ok(!ids.includes("pedido-enviado"));
    assert.ok(!ids.includes("pedido-sem-order"));
  });
});
