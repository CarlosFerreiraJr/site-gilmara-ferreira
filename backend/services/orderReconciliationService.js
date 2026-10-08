
function criarReconciliadorOrders({
  buscarPedidosParaReconciliacao,
  obterOrderValidada,
  processarOrderAprovada,
  registrarPedidoEncerrado
}) {
  return async function reconciliarOrders(limite = 50) {
    const pedidos = buscarPedidosParaReconciliacao(limite);

    const resumo = {
      consultados: pedidos.length,
      processados: 0,
      encerrados: 0,
      ignorados: 0,
      erros: 0
    };

    for (const pedido of pedidos) {
      try {
        // Sempre consulta a fonte oficial antes de agir.
        const orderData = await obterOrderValidada(pedido.order_id);

        if (
          String(orderData.id) !== String(pedido.order_id) ||
          String(orderData.external_reference) !== String(pedido.id)
        ) {
          resumo.ignorados++;
          continue;
        }

        if (
          orderData.status === "processed" &&
          orderData.status_detail === "accredited"
        ) {
          const resultado = await processarOrderAprovada(orderData);

          if (resultado.processado) {
            resumo.processados++;
          } else {
            resumo.ignorados++;
          }

          continue;
        }

        if (
          ["canceled", "expired", "failed"].includes(orderData.status)
        ) {
          const atualizado = registrarPedidoEncerrado({
            pedidoId: pedido.id,
            status: orderData.status
          });

          if (atualizado) {
            resumo.encerrados++;
          } else {
            resumo.ignorados++;
          }

          continue;
        }

        resumo.ignorados++;
      } catch (error) {
        resumo.erros++;

        console.error("❌ Erro na reconciliação da Order:", {
          pedidoId: pedido.id,
          orderId: pedido.order_id,
          mensagem: error.message
        });
      }
    }

    return resumo;
  };
}

module.exports = { criarReconciliadorOrders };
