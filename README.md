# Gilmara Ferreira — Psicanalista Clínica

Site institucional e plataforma de divulgação e comercialização de e-books de **Gilmara Ferreira**, Psicanalista Clínica.

O projeto começou como atividade da disciplina **Tema Integrador I – Gestão de Carreiras**, do curso de **Análise e Desenvolvimento de Sistemas**, e evoluiu para incluir um fluxo de vendas digitais com confirmação de pagamento e entrega automatizada.

**Site publicado:** https://gilmaraferreira.com.br/

## Sobre o projeto

O site apresenta a trajetória e a atuação profissional de Gilmara Ferreira, reúne reflexões, depoimentos e canais de contato e disponibiliza e-books. A área de vendas permite iniciar um pagamento e acompanhar a confirmação do pedido, com entrega do material digital por e-mail após a aprovação validada pelo backend.

## Tecnologias utilizadas

| Camada | Tecnologias |
| --- | --- |
| Frontend | HTML5, CSS3 e JavaScript puro |
| Backend | Node.js e Express |
| Pagamentos | Mercado Pago — Checkout e Orders API, com notificações via webhook |
| E-mail transacional | Resend |
| Persistência | SQLite (`better-sqlite3`) |
| Testes | Node.js Test Runner (`node --test`) |
| Infraestrutura | VPS Locaweb, Ubuntu 24.04 e Nginx |
| HTTPS | Certbot / Let's Encrypt |
| Desenvolvimento e versionamento | Visual Studio Code, Git e GitHub |

## Funcionalidades

- Site responsivo com apresentação profissional, reflexões, depoimentos e contato via WhatsApp.
- Metadados para SEO, `robots.txt` e `sitemap.xml`.
- Divulgação e checkout do e-book **Um Dia de Cada Vez — Volume I: 30 Reflexões para Acolher o Coração**.
- Pagamentos por **Pix e cartão de crédito**, validados em testes reais.
- Acompanhamento do status do pedido pelo site.
- Processamento de webhooks autenticados, com consulta e validação do pagamento junto ao Mercado Pago.
- Registro dos pedidos e do estado de entrega no SQLite.
- Envio automatizado do e-book em PDF por e-mail após aprovação confirmada.
- Proteções contra envios duplicados e rotinas de reconciliação de Orders na versão refatorada.

## Fluxo de compra

```text
Cliente preenche nome e e-mail
             |
             v
Backend cria pedido e inicia checkout no Mercado Pago
             |
             v
Cliente paga por Pix ou cartão
             |
             v
Mercado Pago notifica o webhook
             |
             v
Backend autentica a notificação e consulta o pagamento
             |
             v
Valida pedido, valor, moeda e aprovação
             |
             v
Registra o pagamento e reserva a entrega
             |
             v
Resend envia o PDF ao comprador
             |
             v
Site acompanha o status e informa a conclusão
```

A interface de retorno **não é considerada prova de pagamento**. A entrega depende da validação no servidor. O fluxo também contempla a abertura do checkout em outra aba, permitindo acompanhar o pedido no site e tentar fechar a aba de pagamento após a conclusão, conforme as permissões do navegador.

## Estrutura principal

```text
index.html                        Página inicial
quem-sou.html                     Trajetória profissional
ebooks.html                       Divulgação dos e-books
ebooks-checkout-v2.html           Interface de compra
confirmacao-pagamento.html        Acompanhamento do pedido
reflexoes.html                    Índice de reflexões
depoimentos.html                  Depoimentos
contato.html                      Contato
reflexoes/                        Artigos completos
css/                              Estilos e responsividade
js/                               Interações da interface
assets/images/                    Imagens, logo e capas
backend/server.js                 API HTTP, checkout e webhook
backend/services/                 Pedidos, e-mail e processamento de Orders
backend/tests/                    Testes automatizados
robots.txt                        Orientações para buscadores
sitemap.xml                       Mapa do site
```

## Execução local

### Site institucional

Para visualizar apenas as páginas estáticas, é possível iniciar um servidor na raiz do projeto:

```bash
python -m http.server 8765
```

Acesse `http://localhost:8765`. **Esse servidor estático não executa a API de pagamentos.** Para testar o checkout completo, é necessário configurar e executar o backend e servir o frontend de forma compatível com as rotas `/api`.

### Backend

É necessário ter Node.js instalado. Na pasta `backend`:

```bash
npm install
```

Configure as variáveis de ambiente de acordo com o arquivo `.env.example`, utilizando credenciais apropriadas para o ambiente. **Não publique o `.env`, tokens, segredos de webhook ou dados de compradores.**

A execução do backend deve seguir os scripts disponíveis em `backend/package.json` ou a entrada `server.js` conforme a configuração do ambiente. Pagamentos reais e notificações de produção exigem configuração específica de domínio, HTTPS e webhook.

### Testes automatizados

Na pasta `backend`:

```bash
node --test tests/*.test.js
```

Na revisão de **08/10/2026**, a suíte local apresentou **27 testes aprovados**, cobrindo validação de Orders, processamento, idempotência, falhas de envio, estados de pedido e reconciliação.

## Implantação e ambientes

O site público é servido por **Nginx em uma VPS Locaweb**, com HTTPS configurado por **Let's Encrypt**. A API Node.js opera separadamente das páginas estáticas.

**Atenção à diferença entre versões:** o código do GitHub inclui a refatoração dos serviços e a suíte de testes. Essa refatoração **não foi confirmada como implantada integralmente na VPS**. O ambiente de produção permanece com o fluxo de pagamento e entrega validado em testes reais. Um `git push` não representa, por si só, uma implantação na VPS.

## Segurança e dados privados

- O `.gitignore` exclui credenciais `.env`, dependências `node_modules`, bancos SQLite locais e PDFs comerciais.
- O conteúdo digital comercializado não deve ser disponibilizado publicamente no repositório.
- O backend valida as notificações e o estado do pagamento antes da entrega.
- Dados pessoais de compradores, registros financeiros e credenciais não devem ser incluídos no repositório público.
- Mudanças futuras na lógica de pagamentos devem ser testadas antes de qualquer implantação.

## Evolução planejada

A estrutura será ampliada para oferecer novos e-books e produtos digitais. Essa evolução deverá considerar catálogo de produtos, preços, associação de arquivos digitais a cada item e manutenção dos controles de pagamento, reconciliação e entrega.

## Objetivo acadêmico

O projeto permitiu aplicar conhecimentos de desenvolvimento web a uma necessidade real, passando por levantamento de requisitos, planejamento, construção da interface, responsividade, publicação, hospedagem, HTTPS, versionamento e documentação. Posteriormente, foi expandido com integração de pagamentos, backend, persistência e testes automatizados.

## Autor

**Carlos Ferreira**
Curso: **Análise e Desenvolvimento de Sistemas**
Disciplina de origem: **Tema Integrador I – Gestão de Carreiras**

## Observação

Este repositório contém o código-fonte do site e do sistema de vendas digitais. Materiais comercializados, dados privados e credenciais de acesso não devem ser publicados.
