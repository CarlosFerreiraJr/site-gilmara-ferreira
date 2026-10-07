const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "pedidos.db");
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

function marcarEmailEnviado({
  pedidoId,
  resendEmailId
}) {
  db.prepare(`
    UPDATE pedidos
    SET
      email_enviado = 1,
      resend_email_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    resendEmailId,
    pedidoId
  );

  return buscarPedidoPorId(pedidoId);
}

function reservarEnvioEmail(pedidoId) {
  const resultado = db.prepare(`
    UPDATE pedidos
    SET
      email_enviado = -1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
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

  db.prepare(`
    UPDATE pedidos
    SET
      order_id = ?,
      payment_id = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(orderId),
    String(paymentId),
    status,
    pedidoId
  );

  return buscarPedidoPorId(pedidoId);
}

module.exports = {
  criarPedido,
  buscarPedidoPorId,
  buscarPedidoPorPaymentId,
  registrarPagamento,
  reservarEnvioEmail,
  liberarEnvioEmail,
  marcarEmailEnviado,
  registrarOrderPagamento
};