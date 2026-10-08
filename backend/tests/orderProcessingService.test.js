
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  criarProcessadorOrder
} = require("../services/orderProcessingService");

test("Processa Order aprovada e confirma envio do e-book", async () => {
  const chamadas = [];

  const pedido = {
    id: "pedido-001",
    order_id: "order-001",
    nome: "Comprador Teste",
    email: "comprador@example.com",
    produto: "ebook-30-reflexoes",
    valor: 19.90,
    moeda: "BRL",
    status: "pending",
    email_enviado: 0
  };

  const orderData = {
    id: "order-001",
    external_reference: "pedido-001",
    status: "processed",
    status_detail: "accredited",
    total_paid_amount: "19.90",
    currency: "BRL",
    transactions: {
      payments: [{
        id: "transacao-001",
        reference_id: "payment-001",
        status: "processed",
        status_detail: "accredited",
        paid_amount: "19.90"
      }]
    }
  };

  const processarOrder = criarProcessadorOrder({
    buscarPedidoPorId: (id) => {
      assert.equal(id, pedido.id);
      return pedido;
    },

    registrarOrderPagamento: (dados) => {
      chamadas.push("registrar");
      assert.equal(dados.paymentId, "payment-001");
      return { ...pedido, status: "approved" };
    },

    reservarEnvioEmail: (id) => {
      chamadas.push("reservar");
      assert.equal(id, pedido.id);
      return true;
    },

    enviarEbook: async (dados) => {
      chamadas.push("enviar");
      assert.equal(dados.email, pedido.email);
      return { success: true, emailId: "resend-001" };
    },

    marcarEmailEnviado: (dados) => {
      chamadas.push("confirmar");
      assert.equal(dados.pedidoId, pedido.id);
      assert.equal(dados.resendEmailId, "resend-001");
    }
  });

  const resultado = await processarOrder(orderData);

  assert.equal(resultado.processado, true);
  assert.equal(resultado.pedidoId, pedido.id);
  assert.equal(resultado.resendEmailId, "resend-001");

  assert.deepEqual(chamadas, [
    "registrar",
    "reservar",
    "enviar",
    "confirmar"
  ]);
});


test("Falha do Resend não confirma nem libera a reserva", async () => {
  const chamadas = [];

  const pedido = {
    id: "pedido-falha-001",
    order_id: "order-falha-001",
    nome: "Comprador Teste",
    email: "comprador@example.com",
    produto: "ebook-30-reflexoes",
    valor: 19.90,
    moeda: "BRL",
    status: "pending",
    email_enviado: 0
  };

  const orderData = {
    id: pedido.order_id,
    external_reference: pedido.id,
    status: "processed",
    status_detail: "accredited",
    total_paid_amount: "19.90",
    currency: "BRL",
    transactions: {
      payments: [{
        id: "transacao-falha-001",
        reference_id: "payment-falha-001",
        status: "processed",
        status_detail: "accredited",
        paid_amount: "19.90"
      }]
    }
  };

  const processarOrder = criarProcessadorOrder({
    buscarPedidoPorId: () => pedido,

    registrarOrderPagamento: () => {
      chamadas.push("registrar");
      return { ...pedido, status: "approved" };
    },

    reservarEnvioEmail: () => {
      chamadas.push("reservar");
      return true;
    },

    enviarEbook: async () => {
      chamadas.push("enviar");
      throw new Error("Falha simulada no Resend");
    },

    marcarEmailEnviado: () => {
      chamadas.push("confirmar");
    }
  });

  await assert.rejects(
    processarOrder(orderData),
    /Falha simulada no Resend/
  );

  assert.deepEqual(chamadas, [
    "registrar",
    "reservar",
    "enviar"
  ]);
});


test("Falha no SQLite após envio não permite reenvio automático", async () => {
  const chamadas = [];
  let emailEnviado = -1;

  const pedido = {
    id: "pedido-falha-banco",
    order_id: "order-falha-banco",
    nome: "Comprador Teste",
    email: "comprador@example.com",
    produto: "ebook-30-reflexoes",
    valor: 19.90,
    moeda: "BRL",
    status: "approved",
    email_enviado: -1
  };

  const orderData = {
    id: pedido.order_id,
    external_reference: pedido.id,
    status: "processed",
    status_detail: "accredited",
    total_paid_amount: "19.90",
    currency: "BRL",
    transactions: {
      payments: [{
        id: "transacao-falha-banco",
        reference_id: "payment-falha-banco",
        status: "processed",
        status_detail: "accredited",
        paid_amount: "19.90"
      }]
    }
  };

  const processarOrder = criarProcessadorOrder({
    buscarPedidoPorId: () => pedido,

    registrarOrderPagamento: () => {
      chamadas.push("registrar");
      return pedido;
    },

    reservarEnvioEmail: () => {
      chamadas.push("reservar");
      return emailEnviado === 0;
    },

    enviarEbook: async () => {
      chamadas.push("enviar");
      return { success: true, emailId: "resend-falha-banco" };
    },

    marcarEmailEnviado: () => {
      chamadas.push("confirmar");
      throw new Error("Falha simulada no SQLite");
    }
  });

  // Simula a primeira tentativa com reserva previamente obtida.
  emailEnviado = 0;

  await assert.rejects(
    processarOrder(orderData),
    /Falha simulada no SQLite/
  );

  // Simula que a reserva permaneceu ativa após a falha.
  emailEnviado = -1;

  const segundaTentativa = await processarOrder(orderData);

  assert.equal(segundaTentativa.processado, false);
  assert.deepEqual(chamadas, [
    "registrar",
    "reservar",
    "enviar",
    "confirmar",
    "registrar",
    "reservar"
  ]);
});


test("Notificação repetida não envia o e-book duas vezes", async () => {
  let estadoEnvio = 0;
  let quantidadeEnvios = 0;

  const pedido = {
    id: "pedido-repetido",
    order_id: "order-repetida",
    nome: "Comprador Teste",
    email: "comprador@example.com",
    produto: "ebook-30-reflexoes",
    valor: 19.90,
    moeda: "BRL",
    status: "pending",
    email_enviado: 0
  };

  const orderData = {
    id: pedido.order_id,
    external_reference: pedido.id,
    status: "processed",
    status_detail: "accredited",
    total_paid_amount: "19.90",
    currency: "BRL",
    transactions: {
      payments: [{
        id: "transacao-repetida",
        reference_id: "payment-repetido",
        status: "processed",
        status_detail: "accredited",
        paid_amount: "19.90"
      }]
    }
  };

  const processarOrder = criarProcessadorOrder({
    buscarPedidoPorId: () => pedido,

    registrarOrderPagamento: () => ({
      ...pedido,
      status: "approved"
    }),

    reservarEnvioEmail: () => {
      if (estadoEnvio !== 0) return false;
      estadoEnvio = -1;
      return true;
    },

    enviarEbook: async () => {
      quantidadeEnvios++;
      return {
        success: true,
        emailId: "resend-repetido"
      };
    },

    marcarEmailEnviado: () => {
      estadoEnvio = 1;
    }
  });

  const primeira = await processarOrder(orderData);
  const segunda = await processarOrder(orderData);

  assert.equal(primeira.processado, true);
  assert.equal(segunda.processado, false);
  assert.equal(quantidadeEnvios, 1);
  assert.equal(estadoEnvio, 1);
});
