
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validarPagamentoOrder
} = require("../services/orderValidationService");

function criarDadosValidos() {
  const pedido = {
    id: "pedido-001",
    order_id: "order-001",
    produto: "ebook-30-reflexoes",
    valor: 19.90,
    moeda: "BRL"
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

  return { pedido, orderData };
}

test("Aceita Order com pagamento válido", () => {
  const { pedido, orderData } = criarDadosValidos();

  const resultado = validarPagamentoOrder(orderData, pedido);

  assert.equal(resultado.valido, true);
  assert.equal(resultado.paymentId, "payment-001");
  assert.equal(resultado.transactionId, "transacao-001");
});

test("Rejeita Order vinculada a outro pedido", () => {
  const { pedido, orderData } = criarDadosValidos();

  pedido.order_id = "outra-order";

  const resultado = validarPagamentoOrder(orderData, pedido);

  assert.equal(resultado.valido, false);
});

test("Rejeita valor pago diferente do pedido", () => {
  const { pedido, orderData } = criarDadosValidos();

  orderData.total_paid_amount = "10.00";

  const resultado = validarPagamentoOrder(orderData, pedido);

  assert.equal(resultado.valido, false);
});

test("Rejeita Order sem pagamento aprovado", () => {
  const { pedido, orderData } = criarDadosValidos();

  orderData.transactions.payments[0].status = "pending";

  const resultado = validarPagamentoOrder(orderData, pedido);

  assert.equal(resultado.valido, false);
});

test("Rejeita referência de pedido incompatível", () => {
  const { pedido, orderData } = criarDadosValidos();

  orderData.external_reference = "outro-pedido";

  const resultado = validarPagamentoOrder(orderData, pedido);

  assert.equal(resultado.valido, false);
});
