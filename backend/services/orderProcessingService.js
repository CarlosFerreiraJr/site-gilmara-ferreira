
const {
  validarPagamentoOrder
} = require("./orderValidationService");

function criarProcessadorOrder({
  buscarPedidoPorId,
  registrarOrderPagamento,
  reservarEnvioEmail,
  marcarEmailEnviado,
  enviarEbook
}) {
  return async function processarOrderAprovada(orderData) {
    const pedidoId = orderData?.external_reference;

    if (!pedidoId) {
      return {
        processado: false,
        motivo: "Order sem referência de pedido."
      };
    }

    const pedido = buscarPedidoPorId(pedidoId);

    if (!pedido) {
      return {
        processado: false,
        motivo: "Pedido não encontrado."
      };
    }

    const validacao = validarPagamentoOrder(orderData, pedido);

    if (!validacao.valido) {
      return {
        processado: false,
        motivo: validacao.motivo
      };
    }

    const pedidoAtualizado = registrarOrderPagamento({
      pedidoId: pedido.id,
      orderId: orderData.id,
      paymentId: validacao.paymentId,
      status: "approved"
    });

    const reservado = reservarEnvioEmail(pedidoAtualizado.id);

    if (!reservado) {
      return {
        processado: false,
        motivo: "Envio já reservado ou concluído."
      };
    }

    // Em caso de falha ou resultado incerto do Resend,
    // mantém a reserva para evitar reenvio automático.
    const resultadoEmail = await enviarEbook({
      nome: pedidoAtualizado.nome,
      email: pedidoAtualizado.email
    });

    if (!resultadoEmail?.emailId) {
      throw new Error(
        "Envio sem identificador confirmado pelo Resend."
      );
    }

    marcarEmailEnviado({
      pedidoId: pedidoAtualizado.id,
      resendEmailId: resultadoEmail.emailId
    });

    return {
      processado: true,
      pedidoId: pedidoAtualizado.id,
      resendEmailId: resultadoEmail.emailId
    };
  };
}

module.exports = { criarProcessadorOrder };
