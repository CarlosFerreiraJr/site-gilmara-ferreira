'use strict';
// Contact settings. Static href fallbacks also work without JavaScript.
const SITE_CONFIG = {
  whatsapp: '5521986364209',
  consultation: 'Olá, Gilmara! Conheci seu trabalho através do seu site e gostaria de saber mais sobre os atendimentos e a disponibilidade de horários.',
  ebook: "Olá, Gilmara! Conheci o e-Book '30 Reflexões para Acolher o Coração' através do seu site e gostaria de adquiri-lo por R$ 20,00. Pode me passar as informações para pagamento?",
  baseUrl: '' // Example after a real domain is confirmed: https://your-domain.com
};
const whatsappUrl = message => `https://wa.me/${SITE_CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;
document.querySelectorAll('[data-whatsapp]').forEach(link => {
  link.href = whatsappUrl(SITE_CONFIG[link.dataset.whatsapp]);
});
document.querySelectorAll('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });
const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('#main-nav');
const closeMenu = () => {
  menu.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Abrir menu');
};
if (toggle && menu) {
  document.documentElement.classList.add('js-ready');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { closeMenu(); toggle.focus(); }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header')) closeMenu();
  });
  matchMedia('(min-width: 801px)').addEventListener('change', closeMenu);
}
const form = document.querySelector('#contact-form');
if (form) form.addEventListener('submit', event => {
  event.preventDefault();
  const fields = new FormData(form);
  const name = fields.get('name').trim();
  const message = fields.get('message').trim();
  const status = document.querySelector('#form-status');
  if (!name || !message) { status.textContent = 'Informe seu nome e uma mensagem para continuar.'; return; }
  const lines = [`Olá, Gilmara! Meu nome é ${name}. Conheci seu trabalho pelo site.`];
  if (fields.get('email').trim()) lines.push(`E-mail: ${fields.get('email').trim()}`);
  if (fields.get('phone').trim()) lines.push(`Telefone: ${fields.get('phone').trim()}`);
  lines.push('', message);
  const url = whatsappUrl(lines.join('\n'));
  const link = document.createElement('a');
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = 'Abrir a mensagem preparada no WhatsApp';
  status.replaceChildren(document.createTextNode('Sua mensagem está preparada. Revise e confirme o envio no WhatsApp. '), link);
  window.open(url, '_blank', 'noopener,noreferrer');
});
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.07 });
  document.querySelectorAll('.benefit, .reason-list article').forEach(element => {
    if (element.getBoundingClientRect().top > innerHeight) { element.classList.add('reveal'); observer.observe(element); }
  });
}
// Configure a confirmed site origin. For production SEO, also place these tags in HTML.
if (SITE_CONFIG.baseUrl) {
  const relative = location.pathname.split('/').filter(Boolean).slice(location.pathname.includes('/reflexoes/') ? -2 : -1).join('/') || 'index.html';
  const canonical = new URL(relative, SITE_CONFIG.baseUrl.replace(/\/?$/, '/')).href;
  const link = document.createElement('link'); link.rel = 'canonical'; link.href = canonical; document.head.append(link);
  const meta = document.createElement('meta'); meta.setAttribute('property', 'og:url'); meta.content = canonical; document.head.append(meta);
}
