
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  criarReconciliadorOrders
} = require("../services/orderReconciliationService");

test("Reconciliação processa Order aprovada e vinculada", async () => {
  const chamadas = [];

  const pedido = {
    id: "pedido-reconciliacao-001",
    order_id: "order-reconciliacao-001",
    status: "pending",
    email_enviado: 0
  };

  const orderData = {
    id: pedido.order_id,
    external_reference: pedido.id,
    status: "processed",
    status_detail: "accredited"
  };

  const reconciliarOrders = criarReconciliadorOrders({
    buscarPedidosParaReconciliacao: (limite) => {
      chamadas.push("buscar");
      assert.equal(limite, 50);
      return [pedido];
    },

    obterOrderValidada: async (orderId) => {
      chamadas.push("consultar");
      assert.equal(orderId, pedido.order_id);
      return orderData;
    },

    processarOrderAprovada: async (order) => {
      chamadas.push("processar");
      assert.equal(order.id, pedido.order_id);

      return {
        processado: true,
        pedidoId: pedido.id,
        resendEmailId: "resend-reconciliacao-001"
      };
    },

    registrarPedidoEncerrado: () => {
      throw new Error("Não deveria encerrar pedido aprovado.");
    }
  });

  const resumo = await reconciliarOrders();

  assert.deepEqual(chamadas, [
    "buscar",
    "consultar",
    "processar"
  ]);

  assert.deepEqual(resumo, {
    consultados: 1,
    processados: 1,
    encerrados: 0,
    ignorados: 0,
    erros: 0
  });
});


test("Reconciliação ignora Order vinculada a outro pedido", async () => {
  let processadorChamado = false;

  const pedido = {
    id: "pedido-original",
    order_id: "order-001",
    status: "pending",
    email_enviado: 0
  };

  const reconciliarOrders = criarReconciliadorOrders({
    buscarPedidosParaReconciliacao: () => [pedido],

    obterOrderValidada: async () => ({
      id: "order-001",
      external_reference: "outro-pedido",
      status: "processed",
      status_detail: "accredited"
    }),

    processarOrderAprovada: async () => {
      processadorChamado = true;
      throw new Error("Order incompatível não pode ser processada.");
    },

    registrarPedidoEncerrado: () => {
      throw new Error("Order incompatível não pode encerrar pedido.");
    }
  });

  const resumo = await reconciliarOrders();

  assert.equal(processadorChamado, false);

  assert.deepEqual(resumo, {
    consultados: 1,
    processados: 0,
    encerrados: 0,
    ignorados: 1,
    erros: 0
  });
});


test("Reconciliação ignora Order com pagamento pendente", async () => {
  let quantidadeProcessamentos = 0;
  let quantidadeEncerramentos = 0;

  const pedido = {
    id: "pedido-pendente-001",
    order_id: "order-pendente-001",
    status: "pending",
    email_enviado: 0
  };

  const reconciliarOrders = criarReconciliadorOrders({
    buscarPedidosParaReconciliacao: () => [pedido],

    obterOrderValidada: async (orderId) => {
      assert.equal(orderId, pedido.order_id);

      return {
        id: pedido.order_id,
        external_reference: pedido.id,
        status: "action_required",
        status_detail: "waiting_payment"
      };
    },

    processarOrderAprovada: async () => {
      quantidadeProcessamentos++;
      throw new Error("Pagamento pendente não pode ser processado.");
    },

    registrarPedidoEncerrado: () => {
      quantidadeEncerramentos++;
      throw new Error("Pagamento pendente não pode ser encerrado.");
    }
  });

  const resumo = await reconciliarOrders();

  assert.equal(quantidadeProcessamentos, 0);
  assert.equal(quantidadeEncerramentos, 0);

  assert.deepEqual(resumo, {
    consultados: 1,
    processados: 0,
    encerrados: 0,
    ignorados: 1,
    erros: 0
  });
});


test("Falha ao consultar uma Order não interrompe a reconciliação", async () => {
  const chamadas = [];

  const pedidos = [
    {
      id: "pedido-erro-001",
      order_id: "order-erro-001"
    },
    {
      id: "pedido-valido-002",
      order_id: "order-valida-002"
    }
  ];

  const reconciliarOrders = criarReconciliadorOrders({
    buscarPedidosParaReconciliacao: () => pedidos,

    obterOrderValidada: async (orderId) => {
      chamadas.push(`consultar:${orderId}`);

      if (orderId === "order-erro-001") {
        throw new Error("Falha simulada na API do Mercado Pago");
      }

      return {
        id: "order-valida-002",
        external_reference: "pedido-valido-002",
        status: "processed",
        status_detail: "accredited"
      };
    },

    processarOrderAprovada: async (orderData) => {
      chamadas.push(`processar:${orderData.id}`);

      return {
        processado: true,
        pedidoId: "pedido-valido-002",
        resendEmailId: "resend-002"
      };
    },

    registrarPedidoEncerrado: () => {
      throw new Error("Não deveria encerrar pedidos.");
    }
  });

  const consoleErrorOriginal = console.error;
  const errosRegistrados = [];

  console.error = (...args) => {
    errosRegistrados.push(args);
  };

  let resumo;

  try {
    resumo = await reconciliarOrders();
  } finally {
    console.error = consoleErrorOriginal;
  }

  assert.deepEqual(chamadas, [
    "consultar:order-erro-001",
    "consultar:order-valida-002",
    "processar:order-valida-002"
  ]);

  assert.deepEqual(resumo, {
    consultados: 2,
    processados: 1,
    encerrados: 0,
    ignorados: 0,
    erros: 1
  });

  assert.equal(errosRegistrados.length, 1);
});


test("Reconciliação encerra Order cancelada sem enviar e-book", async () => {
  const chamadas = [];

  const pedido = {
    id: "pedido-cancelado-001",
    order_id: "order-cancelada-001",
    status: "pending",
    email_enviado: 0
  };

  const reconciliarOrders = criarReconciliadorOrders({
    buscarPedidosParaReconciliacao: () => [pedido],

    obterOrderValidada: async (orderId) => {
      chamadas.push("consultar");
      assert.equal(orderId, pedido.order_id);

      return {
        id: pedido.order_id,
        external_reference: pedido.id,
        status: "canceled",
        status_detail: "canceled"
      };
    },

    processarOrderAprovada: async () => {
      throw new Error(
        "Order cancelada não pode enviar e-book."
      );
    },

    registrarPedidoEncerrado: (dados) => {
      chamadas.push("encerrar");

      assert.equal(dados.pedidoId, pedido.id);
      assert.equal(dados.status, "canceled");

      return true;
    }
  });

  const resumo = await reconciliarOrders();

  assert.deepEqual(chamadas, [
    "consultar",
    "encerrar"
  ]);

  assert.deepEqual(resumo, {
    consultados: 1,
    processados: 0,
    encerrados: 1,
    ignorados: 0,
    erros: 0
  });
});
