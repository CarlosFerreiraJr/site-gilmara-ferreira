const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Permite utilizar um banco separado durante os testes.
// Sem essa variável, mantém o banco padrão da aplicação.
const dbPath = process.env.PEDIDOS_DB_PATH
  ? path.resolve(process.env.PEDIDOS_DB_PATH)
  : path.join(dataDir, "pedidos.db");

const db = new Database(dbPath);

// Melhora segurança e consistência do SQLite
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    produto TEXT NOT NULL,
    valor REAL NOT NULL,
    moeda TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL DEFAULT 'pending',
    payment_id TEXT UNIQUE,
    order_id TEXT UNIQUE,
    email_enviado INTEGER NOT NULL DEFAULT 0,
    resend_email_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const colunas = db.prepare("PRAGMA table_info(pedidos)").all();

if (!colunas.some((coluna) => coluna.name === "order_id")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN order_id TEXT");
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_order_id
  ON pedidos(order_id)
`);

function criarPedido({ id, nome, email, produto, valor, moeda = "BRL" }) {
  const stmt = db.prepare(`
    INSERT INTO pedidos (
      id,
      nome,
      email,
      produto,
      valor,
      moeda
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    nome,
    email,
    produto,
    valor,
    moeda
  );

  return buscarPedidoPorId(id);
}

function buscarPedidoPorId(id) {
  return db
    .prepare("SELECT * FROM pedidos WHERE id = ?")
    .get(id);
}


function buscarPedidosParaReconciliacao(limite = 50) {
  const limiteSeguro = Number.isInteger(limite)
    ? Math.max(1, Math.min(limite, 100))
    : 50;

  return db.prepare(`
    SELECT *
    FROM pedidos
    WHERE order_id IS NOT NULL
      AND email_enviado = 0
      AND status IN ('pending', 'approved', 'canceled', 'expired', 'failed')
    ORDER BY created_at ASC
    LIMIT ?
  `).all(limiteSeguro);
}


function buscarPedidoPorPaymentId(paymentId) {
  return db
    .prepare("SELECT * FROM pedidos WHERE payment_id = ?")
    .get(String(paymentId));
}

function registrarPagamento({
  pedidoId,
  paymentId,
  status
}) {  
    
    const pedido = buscarPedidoPorId(pedidoId);

    if (!pedido) {
        throw new Error(`Pedido não encontrado: ${pedidoId}`);
    }

    if (pedido.payment_id && pedido.payment_id !== String(paymentId)) {
        throw new Error(
        `Pedido ${pedidoId} já está associado ao pagamento ${pedido.payment_id}`
        );
    }  

  db.prepare(`
    UPDATE pedidos
    SET
      payment_id = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(paymentId),
    status,
    pedidoId
  );

  return buscarPedidoPorId(pedidoId);
}

function marcarEmailEnviado({ pedidoId, resendEmailId }) {
  if (!pedidoId || !resendEmailId) {
    throw new Error("Pedido e ID do e-mail são obrigatórios.");
  }

  const resultado = db.prepare(`
    UPDATE pedidos
    SET
      email_enviado = 1,
      resend_email_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'approved'
      AND email_enviado = -1
  `).run(String(resendEmailId), pedidoId);

  if (resultado.changes !== 1) {
    throw new Error(
      `Não foi possível confirmar o envio do e-book para o pedido ${pedidoId}`
    );
  }

  return buscarPedidoPorId(pedidoId);
}

function reservarEnvioEmail(pedidoId) {
  const resultado = db.prepare(`
    UPDATE pedidos
    SET
      email_enviado = -1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    AND status = 'approved'
    AND email_enviado = 0
  `).run(pedidoId);

  return resultado.changes === 1;
}

function liberarEnvioEmail(pedidoId) {
  db.prepare(`
    UPDATE pedidos
    SET
      email_enviado = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND email_enviado = -1
  `).run(pedidoId);
}

function registrarOrderPagamento({
  pedidoId,
  orderId,
  paymentId,
  status
}) {
  const pedido = buscarPedidoPorId(pedidoId);

  if (!pedido) {
    throw new Error(`Pedido não encontrado: ${pedidoId}`);
  }

  // Impede que o pedido seja associado a outra Order
  if (pedido.order_id && pedido.order_id !== String(orderId)) {
    throw new Error(
      `Pedido ${pedidoId} já está associado à Order ${pedido.order_id}`
    );
  }

  // Impede que o pedido seja associado a outro pagamento
  if (pedido.payment_id && pedido.payment_id !== String(paymentId)) {
    throw new Error(
      `Pedido ${pedidoId} já está associado ao pagamento ${pedido.payment_id}`
    );
  }

    if (status !== "approved") {
    throw new Error("Status inválido para registrar pagamento aprovado.");
    }

    const resultado = db.prepare(`
        UPDATE pedidos
        SET
            payment_id = ?,
            status = 'approved',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
            AND order_id = ?
            AND (payment_id IS NULL OR payment_id = ?)
            AND status IN ('pending', 'approved', 'canceled', 'expired', 'failed')
        `).run(
        String(paymentId),
        pedidoId,
        String(orderId),
        String(paymentId)
    );

    if (resultado.changes !== 1) {
        throw new Error(
            `Não foi possível registrar o pagamento aprovado do pedido ${pedidoId}`
        );
    }

  return buscarPedidoPorId(pedidoId);
}

function registrarPedidoEncerrado({ pedidoId, status }) {
  const statusPermitidos = ["canceled", "expired", "failed"];

  if (!statusPermitidos.includes(status)) {
    throw new Error(`Status de encerramento inválido: ${status}`);
  }

  const resultado = db.prepare(`
    UPDATE pedidos
    SET
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
      AND email_enviado = 0
  `).run(status, pedidoId);

  return resultado.changes === 1;
}

function vincularOrderAoPedido({ pedidoId, orderId }) {
  if (!pedidoId || !orderId) {
    throw new Error("Pedido e Order são obrigatórios.");
  }

  const resultado = db.prepare(`
    UPDATE pedidos
    SET
      order_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
      AND order_id IS NULL
  `).run(String(orderId), pedidoId);

  if (resultado.changes !== 1) {
    throw new Error(
      `Não foi possível vincular a Order ao pedido ${pedidoId}`
    );
  }

  return buscarPedidoPorId(pedidoId);
}

// Encerra a conexão SQLite.
// Utilizada principalmente para liberar bancos temporários nos testes.
function fecharConexao() {
  if (db.open) {
    db.close();
  }
}

module.exports = {
  criarPedido,
  buscarPedidoPorId,
  buscarPedidoPorPaymentId,
  registrarPagamento,
  reservarEnvioEmail,
  liberarEnvioEmail,
  marcarEmailEnviado,
  registrarOrderPagamento,
  registrarPedidoEncerrado,
  vincularOrderAoPedido,
  fecharConexao,
  buscarPedidosParaReconciliacao
};