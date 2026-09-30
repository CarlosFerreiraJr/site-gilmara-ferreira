# Gilmara Ferreira — Psicanalista Clínica

Projeto de desenvolvimento web elaborado como parte da disciplina **Tema Integrador I – Gestão de Carreiras**, do curso de **Análise e Desenvolvimento de Sistemas**.

## Sobre o projeto

O site foi desenvolvido para fortalecer a presença digital profissional de Gilmara Ferreira, apresentar sua trajetória e atuação como Psicanalista Clínica, disponibilizar conteúdos de reflexão, divulgar e-book, reunir depoimentos e facilitar o contato com pessoas interessadas em atendimento.

Site publicado: https://gilmaraferreira.com.br/

## Tecnologias utilizadas

- HTML5 para estrutura e conteúdo das páginas;
- CSS3 para identidade visual, layout e responsividade;
- JavaScript puro para menu, interações, formulário/WhatsApp e comportamentos da interface;
- Visual Studio Code como ambiente de desenvolvimento;
- Git e GitHub para versionamento e publicação do código-fonte;
- VPS Locaweb com Ubuntu 24.04 e Nginx para hospedagem;
- Certbot / Let's Encrypt para HTTPS.

## Estrutura principal

```text
index.html                 Página inicial
quem-sou.html              Trajetória profissional
ebooks.html                Divulgação do e-book
reflexoes.html             Índice de reflexões
depoimentos.html           Depoimentos
contato.html               Contato e formulário
reflexoes/                 Artigos completos
css/style.css              Estilos e responsividade
js/script.js               Interações e configurações
assets/images/             Imagens, logo e capa do e-book
robots.txt                 Orientações para mecanismos de busca
sitemap.xml                Mapa do site
```

## Funcionalidades

- Navegação responsiva para desktop e dispositivos móveis;
- apresentação profissional e biográfica;
- divulgação de e-book;
- área de reflexões/artigos;
- página de depoimentos;
- contato e direcionamento para WhatsApp;
- metadados para SEO e compartilhamento;
- sitemap e robots.txt;
- uso de HTTPS no ambiente publicado.

## Execução local

Por ser um site estático, basta abrir `index.html` em um navegador. Opcionalmente, é possível executar um servidor local na pasta do projeto:

```bash
python -m http.server 8765
```

Depois, acesse `http://localhost:8765`.

## Hospedagem

O projeto foi preparado para hospedagem em VPS. No ambiente de produção, os arquivos do site são disponibilizados pelo Nginx e associados ao domínio `gilmaraferreira.com.br`, com HTTPS configurado por certificado Let's Encrypt.

## Objetivo acadêmico

O projeto permitiu aplicar conhecimentos de desenvolvimento web em uma necessidade real, passando pelas etapas de levantamento de necessidades, planejamento, construção da interface, responsividade, publicação, hospedagem, segurança HTTPS, versionamento e documentação.

## Autor

**Carlos Ferreira**  
Curso: Análise e Desenvolvimento de Sistemas  
Disciplina: Tema Integrador I – Gestão de Carreiras

## Observação

Este repositório contém o código-fonte do site institucional. Materiais digitais comercializados, dados privados e credenciais de acesso não devem ser incluídos no repositório público.
