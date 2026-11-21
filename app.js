'use strict';

// TUDOCASTS — frontend sem framework, sem build, sem mistério.

const $ = (id) => document.getElementById(id);
const player = $('player');

const NO_PAGES = ['gabrielrpoubel.github.io', 'tudocasts.com.br', 'www.tudocasts.com.br', 'tudocasts.com', 'www.tudocasts.com']
  .includes(location.hostname.toLowerCase());
let API_BASES = NO_PAGES ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [''];
let API_BASE = API_BASES[0];
let TUNNEL_URL = '';

async function buscarTunnelUrl() {
  try {
    const resposta = await fetch('/tunnel-url.json', { cache: 'no-store' });
    if (resposta.ok) {
      const dados = await resposta.json();
      if (dados.url && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(dados.url)) return dados.url;
    }
  } catch (_) { /* sem URL publicada */ }
  return '';
}

async function descobrirApi() {
  if (!NO_PAGES) return;
  TUNNEL_URL = await buscarTunnelUrl();
  API_BASES = TUNNEL_URL
    ? [TUNNEL_URL, 'http://localhost:3000', 'http://127.0.0.1:3000']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  API_BASE = API_BASES[0];
}
const BASE_PATH = location.pathname.startsWith('/tudocasts-site') ? '/tudocasts-site' : '';

const state = {
  token: localStorage.getItem('podcast_exe_token') || '',
  me: null,
  users: [],
  podcasts: [],
  favoritos: [],
  depois: [],
  filter: new URLSearchParams(location.search).get('user') || null,
  modo: null,
  busca: '',
  ordemAsc: false,
  tocando: null,
  imagemPara: null,
};

function msg(texto, erro) {
  const el = $('status');
  el.textContent = erro ? t('INDISPONIVEL') : texto;
  el.style.color = erro ? '#ffffff' : '#b3b3b3';
}

async function api(caminho, opcoes = {}, revalidar = true) {
  const headers = Object.assign({}, opcoes.headers || {});
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (opcoes.body && !(opcoes.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  let ultimoErro = null;
  for (const base of API_BASES) {
    try {
      const init = { ...opcoes, headers };
      if (NO_PAGES && /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(base)) {
        init.targetAddressSpace = 'loopback';
      }
      const resposta = await fetch(base + caminho, init);
      let dados = {};
      try { dados = await resposta.json(); } catch (_) { /* resposta sem JSON */ }
      if (!resposta.ok) {
        const erro = new Error(dados.error || 'ERRO HTTP ' + resposta.status);
        erro.status = resposta.status;
        throw erro;
      }
      return dados;
    } catch (e) {
      if (e.status) throw e;
      ultimoErro = e;
    }
  }

  if (NO_PAGES && revalidar) {
    const atualizada = await buscarTunnelUrl();
    if (atualizada && atualizada !== TUNNEL_URL) {
      TUNNEL_URL = atualizada;
      API_BASES = [atualizada, 'http://localhost:3000', 'http://127.0.0.1:3000'];
      API_BASE = atualizada;
      return api(caminho, opcoes, false);
    }
  }
  throw ultimoErro || new Error('FALHA DE REDE');
}

function aplicarTraducao() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $('descricao-contador').textContent = t('RESTANTES', 300);
  document.querySelectorAll('#menu-idioma button').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.lang === idiomaAtual);
  });
  document.documentElement.lang = idiomaAtual;
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

function urlEpisodio(p) {
  return urlComIdioma(BASE_PATH + '/' + encodeURIComponent(p.ownerLogin) + '/' + encodeURIComponent(slug(p.title)));
}

function urlDoAutor(login) {
  return urlComIdioma(BASE_PATH + '/?user=' + encodeURIComponent(login));
}

function no(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function link(texto, href, acao) {
  const a = no('a', null, texto);
  if (acao) {
    a.href = '#';
    a.addEventListener('click', (e) => { e.preventDefault(); acao(); });
  } else {
    a.href = href;
  }
  return a;
}

async function carregar(inicial) {
  try {
    const lang = state.modo ? 'all' : idiomaAtual;
    const consulta = '?lang=' + lang + (state.filter ? '&user=' + encodeURIComponent(state.filter) : '');
    const [eu, usuarios, episodios] = await Promise.all([
      api('/api/me'),
      api('/api/users?lang=' + lang),
      api('/api/podcasts' + consulta),
    ]);
    state.me = eu.user;
    state.favoritos = eu.favoritos || [];
    state.depois = eu.depois || [];
    state.users = usuarios;
    state.podcasts = episodios;
    renderAuth();
    renderUsuarios();
    renderFeed();
    if (inicial && NO_PAGES) msg(state.me ? t('TERCEIROS') : t('CRIAR_CONTA_DICA'));
  } catch (e) {
    msg('', true);
    mostrarIndisponivel();
  }
}

function mostrarIndisponivel() {
  const usuarios = $('usuarios');
  if (usuarios) usuarios.textContent = t('SERVIDOR_OFF_DICA');
  const box = $('feed');
  if (!box) return;
  box.textContent = '';

  const aviso = document.createElement('div');
  aviso.className = 'aviso-servidor';
  aviso.appendChild(Object.assign(document.createElement('h3'), { textContent: t('SERVIDOR_OFF_TITULO') }));
  aviso.appendChild(Object.assign(document.createElement('p'), { textContent: t('SERVIDOR_OFF_DICA') }));
  if (NO_PAGES) {
    aviso.appendChild(Object.assign(document.createElement('p'), {
      textContent: 'API: ' + (API_BASES[0] || 'não descoberta'),
    }));
  }

  const links = document.createElement('div');
  links.className = 'aviso-links';
  [[t('ABRIR_LOCAL'), 'http://localhost:3000/'], [t('ABRIR_REDE'), 'http://192.168.1.3:3000/']]
    .forEach(([texto, href]) => {
      const a = document.createElement('a');
      a.textContent = texto;
      a.href = href;
      links.appendChild(a);
    });
  aviso.appendChild(links);

  const tentar = document.createElement('button');
  tentar.type = 'button';
  tentar.textContent = t('TENTAR');
  tentar.addEventListener('click', () => carregar());
  aviso.appendChild(tentar);
  box.appendChild(aviso);
}

function renderAuth() {
  const logado = !!state.me;
  $('campos-login').hidden = logado;
  $('botoes-login').hidden = logado;
  $('btn-sair').hidden = !logado;
  $('btn-trocar').hidden = !logado;
  $('btn-upload-panel').hidden = !logado;
  $('upload-panel').hidden = true;
  if (!logado) $('trocar-panel').hidden = true;

  $('btn-favoritos').classList.toggle('ativo', state.modo === 'favoritos');
  $('btn-depois').classList.toggle('ativo', state.modo === 'depois');

  $('quem').textContent = '';
  if (logado) {
    $('quem').appendChild(document.createTextNode(t('LOGADO_COMO')));
    const nome = link(state.me.login.toUpperCase(), urlDoAutor(state.me.login));
    $('quem').appendChild(nome);
    $('quem').appendChild(document.createTextNode(' '));
    if (state.me.mod) $('quem').appendChild(no('span', 'mod-tag', 'MOD'));
  }
}

function renderUsuarios() {
  const box = $('usuarios');
  box.textContent = '';
  const todos = link('>> ' + t('TODOS'), null, () => { state.filter = null; state.modo = null; carregar(); });
  todos.className = 'usuario' + (state.filter === null ? ' ativo' : '');
  box.appendChild(todos);

  if (state.users.length === 0) {
    box.appendChild(no('span', null, '\n' + t('NINGUEM_POSTOU')));
    return;
  }
  for (const u of state.users) {
    const linha = no('a', 'usuario' + (state.filter === u.login ? ' ativo' : null));
    linha.href = urlDoAutor(u.login);
    linha.appendChild(document.createTextNode(u.login + ' '));
    linha.appendChild(no('span', 'qtd', '[' + u.count + ']'));
    box.appendChild(linha);

    if (state.me && state.me.mod && u.login !== state.me.login) {
      const apagar = link(t('APAGAR_CONTA'), null, () => apagarConta(u));
      apagar.style.fontSize = '10px';
      box.appendChild(apagar);
    }
  }
}

function listaVisivel() {
  let lista = state.podcasts.slice();
  if (state.modo === 'favoritos') lista = lista.filter((p) => state.favoritos.includes(p.id));
  if (state.modo === 'depois') lista = lista.filter((p) => state.depois.includes(p.id));
  const q = state.busca.trim().toLowerCase();
  if (q) {
    lista = lista.filter((p) =>
      (p.title + ' ' + (p.description || '') + ' ' + p.ownerLogin).toLowerCase().includes(q));
  }
  lista.sort((a, b) => state.ordemAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
  return lista;
}

function renderFeed() {
  $('feed-titulo').textContent = '';
  const tituloFeed = state.modo === 'favoritos' ? t('FAVORITOS_TITULO')
    : state.modo === 'depois' ? t('VER_DEPOIS_TITULO')
      : state.filter ? t('FEED_DE', state.filter) : t('FEED_GERAL');
  $('feed-titulo').appendChild(no('b', null, tituloFeed));

  const ordem = $('ordem');
  ordem.textContent = '';
  ordem.appendChild(link(state.ordemAsc ? t('MAIS_NOVOS') : t('MAIS_ANTIGOS'), null, () => {
    state.ordemAsc = !state.ordemAsc;
    renderFeed();
  }));

  if (state.filter) {
    $('feed-titulo').appendChild(document.createTextNode(' '));
    $('feed-titulo').appendChild(link(t('VOLTAR_GERAL'), null, () => { state.filter = null; carregar(); }));
  }

  const lista = listaVisivel();
  $('busca-info').textContent = state.busca ? t('RESULTADOS', lista.length) : '';
  const box = $('feed');
  box.textContent = '';

  if (lista.length === 0) {
    box.appendChild(no('div', 'vazio', t('VAZIO')));
    return;
  }

  const tabela = no('table', 'feed');
  const linhaCab = no('tr');
  for (const h of [t('COL_TITULO'), t('COL_PLAY'), t('COL_BAIXAR'), t('COL_TEMPO')]) {
    linhaCab.appendChild(no('th', null, h));
  }
  const cab = no('thead');
  cab.appendChild(linhaCab);
  tabela.appendChild(cab);

  const corpo = no('tbody');
  for (const p of lista) {
    const tr = no('tr');
    const tdTitulo = no('td', 'titulo');
    const tituloLink = link(p.title, urlEpisodio(p));
    tituloLink.target = '_blank';
    tituloLink.rel = 'noopener';
    tdTitulo.appendChild(tituloLink);
    tdTitulo.appendChild(document.createTextNode(' '));
    tdTitulo.appendChild(link(t('DONO', p.ownerLogin), urlDoAutor(p.ownerLogin)));
    if (!p.isPublic) tdTitulo.appendChild(no('span', 'privado', ' ' + t('PRIVADO')));

    if (state.me) {
      const fav = no('a', 'marcador ' + (state.favoritos.includes(p.id) ? 'on' : 'off'),
        state.favoritos.includes(p.id) ? '★' : '☆');
      fav.href = '#';
      fav.title = t('FAVORITO_TITLE');
      fav.addEventListener('click', (e) => { e.preventDefault(); marcar(p, 'favorito'); });
      tdTitulo.appendChild(document.createTextNode(' '));
      tdTitulo.appendChild(fav);

      const dep = no('a', 'marcador ' + (state.depois.includes(p.id) ? 'on' : 'off'),
        state.depois.includes(p.id) ? '◷' : '◴');
      dep.href = '#';
      dep.title = t('DEPOIS_TITLE');
      dep.addEventListener('click', (e) => { e.preventDefault(); marcar(p, 'depois'); });
      tdTitulo.appendChild(document.createTextNode(' '));
      tdTitulo.appendChild(dep);
    }

    if (p.mine || (state.me && state.me.mod)) {
      const ctrls = no('span', 'controles');
      ctrls.appendChild(document.createTextNode(' '));
      ctrls.appendChild(link(t('RENOMEAR'), null, () => renomear(p)));
      ctrls.appendChild(document.createTextNode(' '));
      ctrls.appendChild(link(p.isPublic ? t('PRIVADO_BTN') : t('PUBLICO_BTN'), null, () => alternar(p)));
      ctrls.appendChild(document.createTextNode(' '));
      ctrls.appendChild(link(t('APAGAR'), null, () => apagar(p)));
      ctrls.appendChild(document.createTextNode(' '));
      ctrls.appendChild(link(t('IMAGEM_EDITAR'), null, () => escolherImagem(p)));
      tdTitulo.appendChild(ctrls);
    }
    tr.appendChild(tdTitulo);

    const tdPlay = no('td');
    const botao = no('button', 'btn-play' + (state.tocando === p.id ? ' tocando' : null),
      state.tocando === p.id ? '||' : '>');
    botao.addEventListener('click', () => tocar(p));
    tdPlay.appendChild(botao);
    tr.appendChild(tdPlay);

    const tdDownload = no('td');
    tdDownload.appendChild(link(t('DOWNLOAD'), null, () => baixar(p)));
    tr.appendChild(tdDownload);

    tr.appendChild(no('td', null, tempo(p.duration)));
    corpo.appendChild(tr);
  }
  tabela.appendChild(corpo);
  box.appendChild(tabela);
}

function tocar(p) {
  if (state.tocando === p.id) {
    player.pause();
    state.tocando = null;
    renderFeed();
    return;
  }
  const sufixo = (p.isPublic ? '' : '?token=' + encodeURIComponent(state.token));
  player.src = API_BASE + '/api/podcasts/' + encodeURIComponent(p.id) + '/stream' + sufixo;
  player.play().then(() => { state.tocando = p.id; renderFeed(); }).catch(() => msg('', true));
}

function baixar(p) {
  const sufixo = p.isPublic ? '' : '?token=' + encodeURIComponent(state.token);
  const a = document.createElement('a');
  a.href = API_BASE + '/api/podcasts/' + encodeURIComponent(p.id) + '/download' + sufixo;
  a.download = p.downloadName || p.originalName || p.title || 'episodio.mp3';
  document.body.appendChild(a);
  a.click();
  a.remove();
  msg(t('DOWNLOAD') + ': ' + p.title);
}

async function marcar(p, tipo) {
  try {
    const r = await api('/api/podcasts/' + encodeURIComponent(p.id) + '/marcador', {
      method: 'POST', body: JSON.stringify({ tipo }),
    });
    state.favoritos = r.favoritos || [];
    state.depois = r.depois || [];
    renderFeed();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function renomear(p) {
  const novo = prompt(t('NOVO_TITULO'), p.title);
  if (novo === null || !novo.trim()) return;
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), { method: 'PATCH', body: JSON.stringify({ title: novo.trim() }) });
    msg(t('RENOMEADO'));
    carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function alternar(p) {
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), { method: 'PATCH', body: JSON.stringify({ isPublic: !p.isPublic }) });
    msg(p.isPublic ? t('AGORA_PRIVADO') : t('AGORA_PUBLICO'));
    carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function apagar(p) {
  if (!confirm(t('APAGAR_CONFIRMA', p.title))) return;
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), { method: 'DELETE' });
    if (state.tocando === p.id) { player.pause(); player.removeAttribute('src'); state.tocando = null; }
    msg(t('EP_APAGADO'));
    carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

function escolherImagem(p) {
  state.imagemPara = p.id;
  $('troca-imagem').value = '';
  $('troca-imagem').click();
}

async function trocarImagem() {
  const arquivo = $('troca-imagem').files[0];
  const id = state.imagemPara;
  state.imagemPara = null;
  if (!arquivo || !id) return;
  if (arquivo.size > 1024 * 1024) return msg(t('IMG_GRANDE'));
  const dados = new FormData();
  dados.append('imagem', arquivo);
  try {
    await api('/api/podcasts/' + encodeURIComponent(id) + '/image', { method: 'POST', body: dados });
    msg(t('IMG_ATUALIZADA'));
    carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

async function apagarConta(u) {
  if (!confirm(t('APAGAR_CONTA_CONFIRMA', u.login))) return;
  try {
    await api('/api/users/' + encodeURIComponent(u.id), { method: 'DELETE' });
    msg(t('CONTA_REMOVIDA'));
    carregar();
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

async function autenticar(rota) {
  const login = $('login').value.trim();
  const senha = $('senha').value;
  if (!login || !senha) return msg(t('PREENCHA'));
  try {
    const dados = await api(rota, { method: 'POST', body: JSON.stringify({ login, senha }) });
    state.token = dados.token;
    localStorage.setItem('podcast_exe_token', state.token);
    $('senha').value = '';
    msg(rota === '/api/register' ? t('CONTA_CRIADA') : t('LOGIN_OK'));
    await carregar();
  } catch (e) {
    if (e.status === 401) msg(t('ERRO_LOGIN'));
    else if (e.status >= 400 && e.status < 500) msg(tErro(e.message));
    else msg('', true);
  }
}

async function trocarSenha() {
  const atual = $('senha-atual').value;
  const nova = $('senha-nova').value;
  if (!atual || !nova) return msg(t('PREENCHA_SENHA'));
  try {
    await api('/api/senha', { method: 'POST', body: JSON.stringify({ senhaAtual: atual, novaSenha: nova }) });
    $('trocar-panel').hidden = true;
    $('senha-atual').value = '';
    $('senha-nova').value = '';
    msg(t('SENHA_TROCADA'));
  } catch (e) {
    if (e.status >= 400 && e.status < 500) msg(tErro(e.message));
    else msg('', true);
  }
}

async function sair() {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) { /* já saiu */ }
  state.token = '';
  state.me = null;
  state.filter = null;
  state.modo = null;
  localStorage.removeItem('podcast_exe_token');
  msg(t('SAIDA'));
  carregar();
}

function barra(pct) {
  const cheios = Math.round(pct / 5);
  return '[' + '█'.repeat(cheios) + '░'.repeat(20 - cheios) + ']';
}

function enviarComProgresso(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/api/podcasts');
    xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      const mb = (n) => (n / 1024 / 1024).toFixed(1);
      msg(`${t('ENVIANDO')} ${barra(pct)} ${pct}% (${mb(e.loaded)}/${mb(e.total)} MB)`);
    };
    xhr.onload = () => {
      let dados = {};
      try { dados = JSON.parse(xhr.responseText); } catch (_) { /* vazio */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(dados);
      else reject(new Error(dados.error || 'ERRO HTTP ' + xhr.status));
    };
    xhr.onerror = () => reject(new Error(t('FALHA_REDE')));
    xhr.send(formData);
  });
}

let cropEstado = null;

function abrirRecorte() {
  const arquivo = $('imagem').files[0];
  if (!arquivo || !arquivo.type.startsWith('image/')) return;
  const url = URL.createObjectURL(arquivo);
  const imagem = new Image();
  imagem.onload = () => {
    URL.revokeObjectURL(url);
    cropEstado = { imagem, escala: 1, x: 0, y: 0 };
    $('crop-zoom').value = '100';
    $('crop-box').hidden = false;
    desenharRecorte();
  };
  imagem.onerror = () => URL.revokeObjectURL(url);
  imagem.src = url;
}

function desenharRecorte() {
  if (!cropEstado) return;
  const canvas = $('crop-canvas');
  const ctx = canvas.getContext('2d');
  const tamanho = canvas.width;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, tamanho, tamanho);
  const { imagem, escala, x, y } = cropEstado;
  const base = Math.max(tamanho / imagem.naturalWidth, tamanho / imagem.naturalHeight) * escala;
  const largura = imagem.naturalWidth * base;
  const altura = imagem.naturalHeight * base;
  ctx.drawImage(imagem, (tamanho - largura) / 2 + x, (tamanho - altura) / 2 + y, largura, altura);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(0.5, 0.5, tamanho - 1, tamanho - 1);
}

function aplicarRecorte() {
  if (!cropEstado) return;
  const saida = document.createElement('canvas');
  saida.width = 512; saida.height = 512;
  const ctx = saida.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);
  const { imagem, escala, x, y } = cropEstado;
  const proporcao = 512 / $('crop-canvas').width;
  const base = Math.max(512 / imagem.naturalWidth, 512 / imagem.naturalHeight) * escala;
  const largura = imagem.naturalWidth * base;
  const altura = imagem.naturalHeight * base;
  ctx.drawImage(imagem, (512 - largura) / 2 + x * proporcao, (512 - altura) / 2 + y * proporcao, largura, altura);

  saida.toBlob((blob) => {
    const recortada = new File([blob], 'capa-recortada.png', { type: 'image/png' });
    const transferencia = new DataTransfer();
    transferencia.items.add(recortada);
    $('imagem').files = transferencia.files;
    $('crop-box').hidden = true;
    msg(t('IMG_RECORTADA'));
  }, 'image/png');
}

async function fazerUpload() {
  const arquivo = $('arquivo').files[0];
  const imagem = $('imagem').files[0];
  if (!arquivo) return msg(t('ESCOLHA_ARQUIVO'));
  if (imagem && imagem.size > 1024 * 1024) return msg(t('IMG_GRANDE'));
  msg(t('LENDO'));
  const duracao = await duracaoDoArquivo(arquivo);
  if (duracao < 300) return msg(t('CURTO'));

  const dados = new FormData();
  dados.append('arquivo', arquivo);
  if (imagem) dados.append('imagem', imagem);
  dados.append('title', $('titulo').value);
  dados.append('description', $('descricao').value);
  dados.append('isPublic', $('publico').checked ? '1' : '0');
  dados.append('lang', idiomaAtual);
  dados.append('duration', String(duracao));

  msg(t('ENVIANDO'));
  try {
    await enviarComProgresso(dados);
    $('arquivo').value = '';
    $('imagem').value = '';
    $('btn-recortar').hidden = true;
    $('crop-box').hidden = true;
    cropEstado = null;
    $('titulo').value = '';
    $('descricao').value = '';
    $('descricao-contador').textContent = t('RESTANTES', 300);
    msg(t('PUBLICADO'));
    await carregar();
  } catch (e) { msg(tErro(e.message), !e.status); }
}

function abrirLista(tipo) {
  if (!state.me) return msg(t('PREENCHA'));
  state.modo = state.modo === tipo ? null : tipo;
  state.filter = null;
  renderAuth();
  renderFeed();
  carregar();
}

function alternarUpload() {
  $('upload-panel').hidden = !$('upload-panel').hidden;
}

$('btn-entrar').addEventListener('click', () => autenticar('/api/login'));
$('btn-criar').addEventListener('click', () => autenticar('/api/register'));
$('btn-sair').addEventListener('click', sair);
$('btn-upload').addEventListener('click', fazerUpload);
$('btn-upload-panel').addEventListener('click', alternarUpload);
$('troca-imagem').addEventListener('change', trocarImagem);
$('btn-trocar').addEventListener('click', () => { $('trocar-panel').hidden = !$('trocar-panel').hidden; });
$('btn-cancela-senha').addEventListener('click', () => { $('trocar-panel').hidden = true; });
$('btn-confirmar-senha').addEventListener('click', trocarSenha);
$('btn-favoritos').addEventListener('click', () => abrirLista('favoritos'));
$('btn-depois').addEventListener('click', () => abrirLista('depois'));
$('busca').addEventListener('input', () => { state.busca = $('busca').value; renderFeed(); });
$('descricao').addEventListener('input', () => {
  $('descricao-contador').textContent = t('RESTANTES', 300 - $('descricao').value.length);
});

$('imagem').addEventListener('change', () => {
  $('btn-recortar').hidden = !$('imagem').files[0];
  if ($('imagem').files[0]) abrirRecorte();
});
$('btn-recortar').addEventListener('click', abrirRecorte);
$('crop-aplicar').addEventListener('click', aplicarRecorte);
$('crop-cancelar').addEventListener('click', () => { $('crop-box').hidden = true; });
$('crop-zoom').addEventListener('input', () => {
  if (!cropEstado) return;
  cropEstado.escala = Number($('crop-zoom').value) / 100;
  desenharRecorte();
});

let arrastando = false;
let ultimoPonto = null;
$('crop-canvas').addEventListener('pointerdown', (e) => {
  if (!cropEstado) return;
  arrastando = true;
  ultimoPonto = { x: e.clientX, y: e.clientY };
  $('crop-canvas').setPointerCapture(e.pointerId);
});
$('crop-canvas').addEventListener('pointermove', (e) => {
  if (!arrastando || !cropEstado) return;
  cropEstado.x += e.clientX - ultimoPonto.x;
  cropEstado.y += e.clientY - ultimoPonto.y;
  ultimoPonto = { x: e.clientX, y: e.clientY };
  desenharRecorte();
});
$('crop-canvas').addEventListener('pointerup', () => { arrastando = false; });

$('btn-idioma').addEventListener('click', () => { $('menu-idioma').hidden = !$('menu-idioma').hidden; });
document.querySelectorAll('#menu-idioma button').forEach((b) => {
  b.addEventListener('click', () => {
    const destino = new URL(location.href);
    destino.searchParams.set('lang', b.dataset.lang);
    location.href = destino.toString();
  });
});

$('senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') autenticar('/api/login'); });
$('login').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('senha').focus(); });
player.addEventListener('ended', () => { state.tocando = null; renderFeed(); });

window.addEventListener('unhandledrejection', () => msg('', true));
window.addEventListener('error', () => msg('', true));

(async function iniciar() {
  await descobrirApi();
  aplicarTraducao();
  api('/api/hits')
    .then((d) => { $('hits').textContent = d.hits; })
    .catch(() => { $('hits').textContent = '???'; });
  carregar(true);
})();
