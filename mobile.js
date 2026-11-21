'use strict';

const $ = (id) => document.getElementById(id);
const player = $('player');

const SITE_DOMAINS = ['gabrielrpoubel.github.io', 'tudocasts.com.br', 'www.tudocasts.com.br', 'tudocasts.com', 'www.tudocasts.com'];
let API_BASE = '';

async function descobrirApi() {
  if (!SITE_DOMAINS.includes(location.hostname.toLowerCase())) return;
  try {
    const resposta = await fetch('/tunnel-url.json', { cache: 'no-store' });
    if (resposta.ok) {
      const dados = await resposta.json();
      if (dados.url && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(dados.url)) API_BASE = dados.url;
    }
  } catch (_) { /* sem URL publicada */ }
}

const state = {
  token: localStorage.getItem('podcast_exe_token') || '',
  me: null,
  podcasts: [],
  favoritos: [],
  depois: [],
  view: 'feed',
  filtroUsuario: null,
  busca: '',
  tocando: null,
  imagemPara: null,
  episodio: null,
  querUpload: false,
};

function msg(texto, erro) {
  const el = $('status');
  el.textContent = erro ? t('INDISPONIVEL') : texto;
  el.style.color = erro ? '#fff' : '#b3b3b3';
}

async function api(caminho, opcoes = {}) {
  const headers = Object.assign({}, opcoes.headers || {});
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (opcoes.body && !(opcoes.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const resposta = await fetch(API_BASE + caminho, { ...opcoes, headers });
  let dados = {};
  try { dados = await resposta.json(); } catch (_) { /* resposta sem JSON */ }
  if (!resposta.ok) {
    const erro = new Error(dados.error || 'ERRO HTTP ' + resposta.status);
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(texto, acao, classe) {
  const b = el('button', 'btn' + (classe ? ' ' + classe : ''), texto);
  b.type = 'button';
  b.addEventListener('click', acao);
  return b;
}

function icone(tipo, preenchido) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', preenchido ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (tipo === 'star') {
    const forma = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    forma.setAttribute('points', '12,2 15,9 22,9.5 17,14 18.5,21 12,17 5.5,21 7,14 2,9.5 9,9');
    svg.appendChild(forma);
  } else {
    const circulo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circulo.setAttribute('cx', '12'); circulo.setAttribute('cy', '12'); circulo.setAttribute('r', '9');
    const ponteiros = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ponteiros.setAttribute('d', 'M12 7v5l3 2');
    svg.appendChild(circulo);
    svg.appendChild(ponteiros);
  }
  return svg;
}

function linkTexto(texto, href, classe) {
  const a = el('a', classe || null, texto);
  a.href = href;
  return a;
}

function campo(rotulo, controle, dicaTexto) {
  const label = el('label', 'campo');
  const span = el('span', null, rotulo);
  label.appendChild(span);
  label.appendChild(controle);
  if (dicaTexto) label.appendChild(el('small', 'contador', dicaTexto));
  label.htmlFor = controle.id;
  return label;
}

function tempo(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function slug(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80) || 'episodio';
}

function urlEp(p) {
  const parametros = new URLSearchParams();
  parametros.set('lang', idiomaAtual);
  if (noSite()) parametros.set('mobile', '1');
  return '/mobile/' + encodeURIComponent(p.ownerLogin) + '/' + encodeURIComponent(slug(p.title)) + '?' + parametros.toString();
}

function noSite() {
  return SITE_DOMAINS.includes(location.hostname.toLowerCase());
}

function urlInicio() {
  const p = new URLSearchParams();
  p.set('lang', idiomaAtual);
  if (noSite()) p.set('mobile', '1');
  return '/mobile.html?' + p.toString();
}

function urlUsuario(login) {
  const p = new URLSearchParams();
  p.set('lang', idiomaAtual);
  p.set('user', login);
  if (noSite()) p.set('mobile', '1');
  return '/mobile.html?' + p.toString();
}

function caminhos() {
  const ep = new URLSearchParams(location.search).get('ep');
  if (ep) return ep.split('/').filter(Boolean);
  const partes = location.pathname.split('/').filter(Boolean);
  if (partes[0] === 'mobile') partes.shift();
  return partes;
}

function aplicarTraducao() {
  document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  $('busca').placeholder = t('BUSCA');
  document.documentElement.lang = idiomaAtual;
  document.querySelectorAll('.menu-idioma button').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.lang === idiomaAtual);
  });
  $('btn-idioma').setAttribute('aria-expanded', String(!$('menu-idioma').hidden));
  document.documentElement.classList.remove('aguardando-idioma');
}

function atualizarCabecalho() {
  const ep = state.view === 'episodio';
  const formulario = state.view === 'upload' || state.view === 'conta';
  $('btn-voltar').hidden = !(ep || formulario);
  $('busca-box').hidden = ep || formulario;
  $('nav-inferior').hidden = ep;
  document.body.classList.toggle('com-nav', !ep);

  const titulos = {
    feed: 'TUDOCASTS', favoritos: t('FAVORITOS'), depois: t('VER_DEPOIS'),
    upload: t('UPLOAD'), conta: state.me ? t('CONTA') : t('ENTRAR'), episodio: 'TUDOCASTS',
  };
  $('titulo-app').textContent = titulos[state.view] || 'TUDOCASTS';

  document.querySelectorAll('#nav-inferior button').forEach((b) => {
    b.hidden = b.dataset.aba === 'upload' && !state.me;
    b.classList.toggle('ativo', b.dataset.aba === state.view);
  });
}

function irPara(view) {
  if (view === 'upload' && !state.me) view = 'conta';
  if (view === 'conta' || view === 'upload') msg('');
  player.pause();
  state.tocando = null;
  state.view = view;
  if (view !== 'episodio') state.episodio = null;
  $('menu-idioma').hidden = true;
  $('btn-idioma').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
  render();
}

function render() {
  atualizarCabecalho();
  const app = $('app');
  app.textContent = '';
  if (state.view === 'upload') return renderUpload(app);
  if (state.view === 'conta') return renderConta(app);
  if (state.view === 'episodio') return renderEpisodio(app);
  return renderFeed(app);
}

async function carregar(inicial) {
  try {
    const lang = state.view === 'favoritos' || state.view === 'depois' ? 'all' : idiomaAtual;
    const filtro = state.filtroUsuario ? '&user=' + encodeURIComponent(state.filtroUsuario) : '';
    const [eu, episodios] = await Promise.all([api('/api/me'), api('/api/podcasts?lang=' + lang + filtro)]);
    state.me = eu.user;
    state.favoritos = eu.favoritos || [];
    state.depois = eu.depois || [];
    state.podcasts = episodios;
    if (caminhos().length >= 2) {
      state.view = 'episodio';
      $('app').textContent = '';
      atualizarCabecalho();
      await renderEpisodio($('app'));
    } else {
      render();
    }
    if (inicial) msg(state.me ? t('TERCEIROS') : t('CRIAR_CONTA_DICA'));
  } catch (e) {
    msg(t('FALHA_CARREGAR', e.message), true);
  }
}

function listaVisivel() {
  let lista = state.podcasts.slice();
  if (state.view === 'favoritos') lista = lista.filter((p) => state.favoritos.includes(p.id));
  if (state.view === 'depois') lista = lista.filter((p) => state.depois.includes(p.id));
  const q = state.busca.trim().toLowerCase();
  if (q) {
    lista = lista.filter((p) =>
      (p.title + ' ' + (p.description || '') + ' ' + p.ownerLogin).toLowerCase().includes(q));
  }
  return lista.sort((a, b) => b.createdAt - a.createdAt);
}

function renderFeed(app) {
  const titulo = state.view === 'favoritos' ? t('FAVORITOS_TITULO')
    : state.view === 'depois' ? t('VER_DEPOIS_TITULO')
      : state.filtroUsuario ? t('FEED_DE', state.filtroUsuario) : t('FEED_GERAL');

  const linha = el('div', 'secao-linha');
  linha.appendChild(el('p', 'secao-titulo', titulo));
  if (state.filtroUsuario || state.view !== 'feed') {
    linha.appendChild(botao(t('VOLTAR_GERAL'), () => {
      state.filtroUsuario = null; state.view = 'feed'; carregar();
    }));
  }
  app.appendChild(linha);

  const lista = listaVisivel();
  if (lista.length === 0) {
    app.appendChild(el('div', 'vazio', t('VAZIO')));
    return;
  }

  for (const p of lista) {
    const card = el('div', 'card');
    card.appendChild(linkTexto(p.title, urlEp(p), 'card-titulo'));

    const meta = el('div', 'card-meta');
    meta.appendChild(linkTexto('@' + p.ownerLogin, urlUsuario(p.ownerLogin)));
    meta.appendChild(document.createTextNode(' · ' + tempo(p.duration)));
    if (!p.isPublic) meta.appendChild(document.createTextNode(' · ' + t('PRIVADO')));
    card.appendChild(meta);

    const acoes = el('div', 'acoes');
    const play = botao(state.tocando === p.id ? '||' : '>', () => tocar(p), 'btn-play');
    play.setAttribute('aria-label', p.title);
    acoes.appendChild(play);
    acoes.appendChild(botao(t('DOWNLOAD'), () => baixar(p)));

    if (state.me) {
      const fav = botao(state.favoritos.includes(p.id) ? '\u2605' : '\u2606',
        () => marcar(p, 'favorito'), state.favoritos.includes(p.id) ? 'ativo' : '');
      fav.setAttribute('aria-label', t('FAVORITO_TITLE'));
      acoes.appendChild(fav);

      const dep = botao(state.depois.includes(p.id) ? '\u25f7' : '\u2314',
        () => marcar(p, 'depois'), state.depois.includes(p.id) ? 'ativo' : '');
      dep.setAttribute('aria-label', t('DEPOIS_TITLE'));
      acoes.appendChild(dep);
    }

    if (p.mine || (state.me && state.me.mod)) {
      acoes.appendChild(botao(t('RENOMEAR'), () => renomear(p)));
      acoes.appendChild(botao(p.isPublic ? t('PRIVADO_BTN') : t('PUBLICO_BTN'), () => alternar(p)));
      acoes.appendChild(botao(t('IMAGEM_EDITAR'), () => {
        state.imagemPara = p.id; $('troca-imagem').value = ''; $('troca-imagem').click();
      }));
      acoes.appendChild(botao(t('APAGAR'), () => apagar(p)));
    }
    card.appendChild(acoes);
    app.appendChild(card);
  }
}

function renderUpload(app) {
  app.appendChild(el('p', 'secao-titulo', t('NOVO_EPISODIO')));

  const arquivo = el('input'); arquivo.type = 'file'; arquivo.id = 'arquivo'; arquivo.accept = 'audio/*';
  const titulo = el('input'); titulo.type = 'text'; titulo.id = 'titulo'; titulo.maxLength = 120;
  const descricao = el('textarea'); descricao.id = 'descricao'; descricao.rows = 4; descricao.maxLength = 300;
  const imagem = el('input'); imagem.type = 'file'; imagem.id = 'imagem'; imagem.accept = 'image/*';
  const publico = el('input'); publico.type = 'checkbox'; publico.id = 'publico'; publico.checked = true;
  const contador = el('small', 'contador', t('RESTANTES', 300));
  contador.id = 'descricao-contador';

  app.appendChild(campo(t('ARQUIVO'), arquivo));
  app.appendChild(campo(t('TITULO'), titulo));
  const campoDesc = campo(t('DESCRICAO'), descricao);
  campoDesc.insertBefore(contador, descricao);
  app.appendChild(campoDesc);
  app.appendChild(campo(t('IMAGEM'), imagem));

  const check = el('label', 'campo check');
  check.appendChild(publico);
  check.appendChild(el('span', null, t('PUBLICO')));
  check.htmlFor = 'publico';
  app.appendChild(check);

  descricao.addEventListener('input', () => {
    contador.textContent = t('RESTANTES', 300 - descricao.value.length);
  });

  const botoes = el('div', 'botoes-form');
  botoes.appendChild(botao(t('FAZER_UPLOAD'), () => fazerUpload(arquivo, titulo, descricao, imagem, publico), 'primario largo'));
  botoes.appendChild(botao(t('CANCELAR'), () => irPara('feed'), 'largo'));
  app.appendChild(botoes);
}

function renderConta(app) {
  if (!state.me) {
    app.appendChild(el('p', 'dica', t('DICA_LOGIN')));

    const usuario = el('input'); usuario.type = 'text'; usuario.id = 'login-usuario'; usuario.maxLength = 24; usuario.autocomplete = 'username';
    const senha = el('input'); senha.type = 'password'; senha.id = 'senha-usuario'; senha.maxLength = 128; senha.autocomplete = 'current-password';
    app.appendChild(campo(t('LOGIN'), usuario));
    app.appendChild(campo(t('SENHA'), senha));

    const botoes = el('div', 'botoes-form');
    botoes.appendChild(botao(t('ENTRAR'), () => autenticar('/api/login', usuario, senha), 'primario largo'));
    botoes.appendChild(botao(t('CRIAR_CONTA'), () => autenticar('/api/register', usuario, senha), 'largo'));
    app.appendChild(botoes);
    app.appendChild(el('p', 'dica', t('ESQUECEU')));
    setTimeout(() => usuario.focus(), 0);
    return;
  }

  app.appendChild(el('p', 'secao-titulo', t('TROCAR_SENHA')));
  const atual = el('input'); atual.type = 'password'; atual.id = 'senha-atual';
  const nova = el('input'); nova.type = 'password'; nova.id = 'senha-nova';
  app.appendChild(campo(t('SENHA_ATUAL'), atual));
  app.appendChild(campo(t('NOVA_SENHA'), nova));
  const botoes = el('div', 'botoes-form');
  botoes.appendChild(botao(t('CONFIRMAR'), () => trocarSenha(atual, nova), 'primario largo'));
  botoes.appendChild(botao(t('SAIR'), sair, 'largo'));
  app.appendChild(botoes);
}

async function renderEpisodio(app) {
  const partes = caminhos();
  const autor = decodeURIComponent(partes[0]);
  const titulo = decodeURIComponent(partes.slice(1).join('/'));
  const [resultado, info] = await Promise.all([api('/api/podcasts?lang=all'), api('/api/me')]);
  const p = resultado.find((x) => x.ownerLogin === autor && slug(x.title) === titulo);
  if (!p) {
    msg(t('SEM_EP'));
    return;
  }
  state.episodio = p;
  state.me = info.user;

  const capas = el('div', 'capas');
  if (p.image) {
    const img = el('img', 'capa');
    img.src = API_BASE + '/api/imagem/' + encodeURIComponent(p.image);
    img.alt = p.title;
    capas.appendChild(img);
  } else {
    capas.appendChild(el('div', 'sem-capa', t('SEM_IMAGEM')));
  }
  app.appendChild(capas);
  app.appendChild(el('h2', 'ep-titulo', p.title));

  const autorLinha = el('p', 'ep-autor');
  autorLinha.appendChild(linkTexto('@' + p.ownerLogin, urlUsuario(p.ownerLogin)));
  autorLinha.appendChild(document.createTextNode(' · ' + tempo(p.duration)));
  app.appendChild(autorLinha);
  app.appendChild(el('div', 'ep-descricao', p.description || t('SEM_DESCRICAO')));

  const playerLinha = el('div', 'ep-player');
  const play = botao('>', () => {}, 'btn-play');
  const atual = el('span', 'tempo', '0:00');
  const progresso = el('input'); progresso.type = 'range'; progresso.min = '0'; progresso.max = '1000'; progresso.value = '0';
  const total = el('span', 'tempo', tempo(p.duration));
  playerLinha.appendChild(play); playerLinha.appendChild(atual); playerLinha.appendChild(progresso); playerLinha.appendChild(total);
  app.appendChild(playerLinha);

  const sufixo = p.isPublic ? '' : '?token=' + encodeURIComponent(state.token);
  player.src = API_BASE + '/api/podcasts/' + encodeURIComponent(p.id) + '/stream' + sufixo;
  play.addEventListener('click', () => {
    if (player.paused) player.play().catch(() => msg('', true));
    else player.pause();
    play.textContent = player.paused ? '>' : '||';
  });
  player.addEventListener('play', () => { play.textContent = '||'; });
  player.addEventListener('pause', () => { play.textContent = '>'; });
  player.addEventListener('timeupdate', () => {
    if (!player.duration) return;
    atual.textContent = tempo(player.currentTime);
    progresso.value = String(Math.round((player.currentTime / player.duration) * 1000));
  });
  progresso.addEventListener('input', () => {
    if (player.duration) player.currentTime = (Number(progresso.value) / 1000) * player.duration;
  });

  const vels = el('div', 'velocidades');
  for (const v of ['0.75', '1', '1.25', '1.5', '2', '4']) {
    const b = botao(v + 'x', () => {
      player.playbackRate = Number(v);
      vels.querySelectorAll('button').forEach((x) => x.classList.remove('ativo'));
      b.classList.add('ativo');
      msg(t('VELOCIDADE', v + 'x'));
    }, v === '1' ? 'ativo' : '');
    vels.appendChild(b);
  }
  app.appendChild(vels);

  const sequencia = resultado.filter((x) => x.ownerLogin === p.ownerLogin).sort((a, b) => b.createdAt - a.createdAt);
  const i = sequencia.findIndex((x) => x.id === p.id);
  const nav = el('div', 'ep-navegacao');
  if (i > 0) nav.appendChild(linkTexto(t('ULTIMO'), urlEp(sequencia[i - 1])));
  if (i >= 0 && i < sequencia.length - 1) nav.appendChild(linkTexto(t('PROXIMO'), urlEp(sequencia[i + 1])));
  app.appendChild(nav);

  if (state.me && (p.mine || state.me.mod)) {
    const acoes = el('div', 'ep-acoes');
    acoes.appendChild(botao(t('TROCAR_IMG'), () => {
      state.imagemPara = p.id; $('troca-imagem').value = ''; $('troca-imagem').click();
    }));
    if (p.image) {
      acoes.appendChild(botao(t('REMOVER_IMG'), async () => {
        try {
          await api('/api/podcasts/' + encodeURIComponent(p.id) + '/image', { method: 'DELETE' });
          msg(t('IMG_REMOVIDA')); carregar();
        } catch (e) { msg(tErro(e.message), !e.status); }
      }));
    }
    if (state.me.mod) {
      acoes.appendChild(botao(t('APAGAR_EP'), async () => {
        if (!confirm(t('APAGAR_EP_CONFIRMA'))) return;
        try {
          await api('/api/podcasts/' + encodeURIComponent(p.id), { method: 'DELETE' });
          location.href = urlInicio();
        } catch (e) { msg(tErro(e.message), !e.status); }
      }));
    }
    app.appendChild(acoes);
  }

  app.appendChild(el('p', 'secao-titulo', t('COMENTARIOS')));
  const lista = el('div');
  app.appendChild(lista);

  async function carregarComentarios() {
    const dados = await api('/api/podcasts/' + encodeURIComponent(p.id) + '/comments');
    lista.textContent = '';
    if (dados.length === 0) {
      lista.appendChild(el('div', 'vazio', t('SEM_COMENTARIOS')));
      return;
    }
    for (const c of dados) {
      const div = el('div', 'comentario');
      const cab = el('div', 'cabecalho');
      cab.appendChild(linkTexto('@' + c.userLogin, urlUsuario(c.userLogin), 'quem'));
      cab.appendChild(el('span', 'data', new Date(c.createdAt).toLocaleString(idiomaAtual === 'en' ? 'en-US' : idiomaAtual === 'es' ? 'es-ES' : 'pt-BR')));
      if (c.removivel) {
        cab.appendChild(botao(t('REMOVER'), async () => {
          try { await api('/api/comments/' + encodeURIComponent(c.id), { method: 'DELETE' }); await carregarComentarios(); }
          catch (e) { msg('', !e.status); }
        }));
      }
      div.appendChild(cab);
      div.appendChild(el('div', 'texto', c.texto));
      lista.appendChild(div);
    }
  }

  if (state.me) {
    const campoCom = el('input'); campoCom.id = 'texto-comentario'; campoCom.type = 'text';
    campoCom.maxLength = 500; campoCom.placeholder = t('SEU_COMENTARIO');
    app.appendChild(campoCom);
    const enviar = botao(t('COMENTAR'), async () => {
      const texto = campoCom.value.trim();
      if (!texto) return msg(t('ESCREVA'));
      try {
        await api('/api/podcasts/' + encodeURIComponent(p.id) + '/comments', {
          method: 'POST', body: JSON.stringify({ texto }),
        });
        campoCom.value = ''; await carregarComentarios(); msg(t('COMENTARIO_OK'));
      } catch (e) { msg(tErro(e.message), !e.status); }
    }, 'primario largo');
    app.appendChild(enviar);
  }
  if (!state.me) {
    app.appendChild(el('p', 'dica', t('DICA_LOGIN')));
    app.appendChild(botao(t('ENTRAR'), () => irPara('conta'), 'primario largo'));
  }
  await carregarComentarios();

  app.appendChild(linkTexto(t('VOLTAR_FEED'), urlInicio(), 'voltar-feed'));
}

function tocar(p) {
  if (state.tocando === p.id) {
    player.pause(); state.tocando = null; render(); return;
  }
  const sufixo = p.isPublic ? '' : '?token=' + encodeURIComponent(state.token);
  player.src = API_BASE + '/api/podcasts/' + encodeURIComponent(p.id) + '/stream' + sufixo;
  player.play().then(() => { state.tocando = p.id; render(); }).catch(() => msg('', true));
}

function baixar(p) {
  const sufixo = p.isPublic ? '' : '?token=' + encodeURIComponent(state.token);
  const a = el('a');
  a.href = API_BASE + '/api/podcasts/' + encodeURIComponent(p.id) + '/download' + sufixo;
  a.download = p.downloadName || p.title || 'episodio.mp3';
  document.body.appendChild(a); a.click(); a.remove();
  msg(t('DOWNLOAD') + ': ' + p.title);
}

async function marcar(p, tipo) {
  try {
    const r = await api('/api/podcasts/' + encodeURIComponent(p.id) + '/marcador', {
      method: 'POST', body: JSON.stringify({ tipo }),
    });
    state.favoritos = r.favoritos || [];
    state.depois = r.depois || [];
    render();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function renomear(p) {
  const novo = prompt(t('NOVO_TITULO'), p.title);
  if (!novo || !novo.trim()) return;
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), { method: 'PATCH', body: JSON.stringify({ title: novo.trim() }) });
    msg(t('RENOMEADO')); carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function alternar(p) {
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), { method: 'PATCH', body: JSON.stringify({ isPublic: !p.isPublic }) });
    msg(p.isPublic ? t('AGORA_PRIVADO') : t('AGORA_PUBLICO')); carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function apagar(p) {
  if (!confirm(t('APAGAR_CONFIRMA', p.title))) return;
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), { method: 'DELETE' });
    msg(t('EP_APAGADO')); carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

function duracaoDoArquivo(file) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(audio.duration) ? audio.duration : 0); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    audio.src = url;
  });
}

async function fazerUpload(arquivoInput, tituloInput, descricaoInput, imagemInput, publicoInput) {
  const arquivo = arquivoInput.files[0];
  const imagem = imagemInput.files[0];
  if (!arquivo) return msg(t('ESCOLHA_ARQUIVO'));
  if (imagem && imagem.size > 1024 * 1024) return msg(t('IMG_GRANDE'));
  msg(t('LENDO'));
  const duracao = await duracaoDoArquivo(arquivo);
  if (duracao < 300) return msg(t('CURTO'));

  const dados = new FormData();
  dados.append('arquivo', arquivo);
  if (imagem) dados.append('imagem', imagem);
  dados.append('title', tituloInput.value);
  dados.append('description', descricaoInput.value);
  dados.append('isPublic', publicoInput.checked ? '1' : '0');
  dados.append('lang', idiomaAtual);
  dados.append('duration', String(duracao));

  msg(t('ENVIANDO'));
  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/podcasts');
      xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) msg(t('ENVIANDO') + ' ' + Math.round((e.loaded / e.total) * 100) + '%');
      };
      xhr.onload = () => {
        let d = {};
        try { d = JSON.parse(xhr.responseText); } catch (_) { /* vazio */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(d);
        else reject(new Error(d.error || 'ERRO HTTP ' + xhr.status));
      };
      xhr.onerror = () => reject(new Error(t('FALHA_REDE')));
      xhr.send(dados);
    });
    msg(t('PUBLICADO'));
    state.querUpload = false;
    irPara('feed');
    carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function autenticar(rota, usuarioInput, senhaInput) {
  const login = usuarioInput.value.trim();
  const senha = senhaInput.value;
  if (!login || !senha) return msg(t('PREENCHA'));
  try {
    const dados = await api(rota, { method: 'POST', body: JSON.stringify({ login, senha }) });
    state.token = dados.token;
    localStorage.setItem('podcast_exe_token', state.token);
    msg(rota === '/api/register' ? t('CONTA_CRIADA') : t('LOGIN_OK'));
    if (state.querUpload) {
      state.querUpload = false;
      irPara('upload');
    } else {
      irPara('feed');
    }
    await carregar();
  } catch (e) {
    if (e.status === 401) msg(t('ERRO_LOGIN'));
    else if (e.status >= 400 && e.status < 500) msg(tErro(e.message));
    else msg('', true);
  }
}

async function trocarSenha(atualInput, novaInput) {
  const senhaAtual = atualInput.value;
  const novaSenha = novaInput.value;
  if (!senhaAtual || !novaSenha) return msg(t('PREENCHA_SENHA'));
  try {
    await api('/api/senha', { method: 'POST', body: JSON.stringify({ senhaAtual, novaSenha }) });
    msg(t('SENHA_TROCADA'));
    irPara('feed');
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function sair() {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) { /* já saiu */ }
  state.token = ''; state.me = null; state.favoritos = []; state.depois = []; state.querUpload = false;
  localStorage.removeItem('podcast_exe_token');
  msg(t('SAIDA'));
  irPara('feed');
  carregar();
}

$('btn-voltar').addEventListener('click', () => {
  if (state.view === 'episodio') location.href = urlInicio();
  else irPara('feed');
});

$('titulo-app').addEventListener('click', () => { location.href = urlInicio(); });
$('titulo-app').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    location.href = urlInicio();
  }
});

document.querySelectorAll('#nav-inferior button').forEach((b) => {
  b.addEventListener('click', () => {
    const aba = b.dataset.aba;
    if (aba === 'upload' && !state.me) state.querUpload = true;
    irPara(aba);
    if (aba === 'feed' || aba === 'favoritos' || aba === 'depois') carregar();
  });
});

$('busca').addEventListener('input', () => {
  state.busca = $('busca').value;
  if (state.view === 'feed' || state.view === 'favoritos' || state.view === 'depois') render();
});

$('troca-imagem').addEventListener('change', async () => {
  const arquivo = $('troca-imagem').files[0];
  const id = state.imagemPara;
  state.imagemPara = null;
  if (!arquivo || !id) return;
  if (arquivo.size > 1024 * 1024) return msg(t('IMG_GRANDE'));
  const dados = new FormData();
  dados.append('imagem', arquivo);
  try {
    await api('/api/podcasts/' + encodeURIComponent(id) + '/image', { method: 'POST', body: dados });
    msg(t('IMG_ATUALIZADA')); carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
});

$('btn-idioma').addEventListener('click', () => {
  $('menu-idioma').hidden = !$('menu-idioma').hidden;
  $('btn-idioma').setAttribute('aria-expanded', String(!$('menu-idioma').hidden));
});
document.querySelectorAll('.menu-idioma button').forEach((b) => {
  b.addEventListener('click', () => {
    const params = new URLSearchParams();
    params.set('lang', b.dataset.lang);
    if (noSite()) params.set('mobile', '1');
    if (state.view === 'episodio' && state.episodio) {
      params.set('ep', state.episodio.ownerLogin + '/' + slug(state.episodio.title));
    } else {
      const ep = new URLSearchParams(location.search).get('ep');
      if (ep) params.set('ep', ep);
      if (state.filtroUsuario) params.set('user', state.filtroUsuario);
    }
    location.href = '/mobile.html?' + params.toString();
  });
});

player.addEventListener('ended', () => { state.tocando = null; });
window.addEventListener('unhandledrejection', () => msg('', true));
window.addEventListener('error', () => msg('', true));

(async function iniciar() {
  await descobrirApi();
  aplicarTraducao();
  carregar(true);
})();
