
function validarPagamentoOrder(orderData, pedido) {
  if (!orderData || !pedido) {
    return { valido: false, motivo: "Order ou pedido ausente." };
  }

  if (
    !orderData.id ||
    !pedido.order_id ||
    String(orderData.id) !== String(pedido.order_id)
  ) {
    return { valido: false, motivo: "Order não vinculada ao pedido." };
  }

  if (String(orderData.external_reference) !== String(pedido.id)) {
    return { valido: false, motivo: "Referência do pedido incompatível." };
  }

  if (
    orderData.status !== "processed" ||
    orderData.status_detail !== "accredited"
  ) {
    return { valido: false, motivo: "Order ainda não aprovada." };
  }

  if (pedido.produto !== "ebook-30-reflexoes") {
    return { valido: false, motivo: "Produto incompatível." };
  }

  const valorPedido = Math.round(Number(pedido.valor) * 100);
  const valorPago = Math.round(Number(orderData.total_paid_amount) * 100);

  if (
    !Number.isFinite(valorPedido) ||
    !Number.isFinite(valorPago) ||
    valorPedido <= 0 ||
    valorPedido !== valorPago
  ) {
    return { valido: false, motivo: "Valor pago incompatível." };
  }

  if (orderData.currency !== pedido.moeda) {
    return { valido: false, motivo: "Moeda incompatível." };
  }

  const pagamentos = orderData.transactions?.payments;

  if (!Array.isArray(pagamentos)) {
    return { valido: false, motivo: "Transações ausentes." };
  }

  const pagamento = pagamentos.find((item) => {
    const valor = Math.round(Number(item.paid_amount) * 100);

    return (
      item.status === "processed" &&
      item.status_detail === "accredited" &&
      Number.isFinite(valor) &&
      valor === valorPedido &&
      item.id &&
      item.reference_id
    );
  });

  if (!pagamento) {
    return { valido: false, motivo: "Pagamento aprovado não encontrado." };
  }

  return {
    valido: true,
    paymentId: String(pagamento.reference_id),
    transactionId: String(pagamento.id)
  };
}

module.exports = { validarPagamentoOrder };
