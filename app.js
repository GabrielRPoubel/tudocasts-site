'use strict';

// TUDOCASTS — frontend sem framework, sem build, sem mistério.

const $ = (id) => document.getElementById(id);
const player = $('player');

// No Pages, a interface é estática e o backend vive no PC do dono.
const DOMINIOS_PUBLICADOS = [
  'gabrielrpoubel.github.io',
  'tudocasts.com.br',
  'www.tudocasts.com.br',
  'tudocasts.com',
  'www.tudocasts.com',
];
const NO_PAGES = DOMINIOS_PUBLICADOS.includes(location.hostname.toLowerCase());
const API_BASE = NO_PAGES ? 'http://localhost:3000' : '';
const BASE_PATH = location.pathname.startsWith('/tudocasts-site') ? '/tudocasts-site' : '';

const state = {
  token: localStorage.getItem('podcast_exe_token') || '',
  me: null,
  users: [],
  podcasts: [],
  favoritos: [],
  depois: [],
  filter: null,
  busca: '',
  ordemAsc: false,
  tocando: null,
};

const MSG_INDISPONIVEL = 'Servidor indisponível. Manutenção em breve. Por favor, volte mais tarde.';

function msg(texto, erro) {
  const el = $('status');
  el.textContent = erro ? MSG_INDISPONIVEL : texto;
  el.style.color = erro ? '#ffffff' : '#b3b3b3';
}

async function api(caminho, opcoes = {}) {
  const headers = Object.assign({}, opcoes.headers || {});
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (opcoes.body && !(opcoes.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const init = { ...opcoes, headers };
  if (NO_PAGES) init.targetAddressSpace = 'loopback';
  const resposta = await fetch(API_BASE + caminho, init);
  let dados = {};
  try { dados = await resposta.json(); } catch (_) { /* resposta sem JSON */ }
  if (!resposta.ok) {
    const erro = new Error(dados.error || 'ERRO HTTP ' + resposta.status);
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

function tempo(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function slug(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80) || 'episodio';
}

function urlEpisodio(p) {
  return BASE_PATH + '/' + encodeURIComponent(p.ownerLogin) + '/' + encodeURIComponent(slug(p.title));
}

function no(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function link(texto, acao) {
  const a = no('a', null, texto);
  a.href = '#';
  a.addEventListener('click', (e) => { e.preventDefault(); acao(); });
  return a;
}

async function carregar(inicial) {
  try {
    const consulta = state.filter ? '?user=' + encodeURIComponent(state.filter) : '';
    const [eu, usuarios, episodios] = await Promise.all([
      api('/api/me'),
      api('/api/users'),
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
    if (inicial && NO_PAGES) msg('Não me responsabilizo pelo que é postado por terceiros.');
  } catch (e) {
    msg('FALHA AO CARREGAR: ' + e.message, true);
  }
}

function renderAuth() {
  const logado = !!state.me;
  $('campos-login').hidden = logado;
  $('botoes-login').hidden = logado;
  $('btn-sair').hidden = !logado;
  $('btn-trocar').hidden = !logado;
  $('upload-panel').hidden = !logado;
  if (!logado) $('trocar-panel').hidden = true;

  $('quem').textContent = '';
  if (logado) {
    $('quem').appendChild(document.createTextNode(':: LOGADO COMO ' + state.me.login.toUpperCase() + ' '));
    if (state.me.mod) $('quem').appendChild(no('span', 'mod-tag', 'MOD'));
  }
}

function renderUsuarios() {
  const box = $('usuarios');
  box.textContent = '';

  const todos = no('a', 'usuario' + (state.filter === null ? ' ativo' : null), '>> TODOS');
  todos.href = '#';
  todos.addEventListener('click', (e) => { e.preventDefault(); state.filter = null; carregar(); });
  box.appendChild(todos);

  if (state.users.length === 0) {
    box.appendChild(no('span', null, '\nNINGUÉM POSTOU AINDA.'));
    return;
  }
  for (const u of state.users) {
    const linha = no('a', 'usuario' + (state.filter === u.login ? ' ativo' : null));
    linha.href = '#';
    linha.appendChild(document.createTextNode(u.login + ' '));
    linha.appendChild(no('span', 'qtd', '[' + u.count + ']'));
    linha.addEventListener('click', (e) => {
      e.preventDefault();
      state.filter = state.filter === u.login ? null : u.login;
      carregar();
    });
    box.appendChild(linha);

    if (state.me && state.me.mod && u.login !== state.me.login) {
      const apagar = link('[apagar conta]', () => apagarConta(u));
      apagar.style.fontSize = '10px';
      box.appendChild(apagar);
    }
  }
}

function listaVisivel() {
  let lista = state.podcasts.slice();
  const q = state.busca.trim().toLowerCase();
  if (q) {
    lista = lista.filter((p) =>
      (p.title + ' ' + (p.description || '') + ' ' + p.ownerLogin).toLowerCase().includes(q));
  }
  lista.sort((a, b) => state.ordemAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
  return lista;
}

function renderFeed() {
  $('feed-titulo').innerHTML = '';
  $('feed-titulo').appendChild(no('b', null,
    state.filter ? ':: FEED DE ' + state.filter.toUpperCase() + ' ::' : ':: FEED GERAL ::'));

  const ordem = $('ordem');
  ordem.textContent = '';
  ordem.appendChild(link(state.ordemAsc ? '[MAIS NOVOS PRIMEIRO]' : '[MAIS ANTIGOS PRIMEIRO]', () => {
    state.ordemAsc = !state.ordemAsc;
    renderFeed();
  }));

  if (state.filter) {
    $('feed-titulo').appendChild(document.createTextNode(' '));
    $('feed-titulo').appendChild(link('[VOLTAR AO GERAL]', () => { state.filter = null; carregar(); }));
  }

  const lista = listaVisivel();
  $('busca-info').textContent = state.busca ? lista.length + ' RESULTADO(S)' : '';
  const box = $('feed');
  box.textContent = '';

  if (lista.length === 0) {
    box.appendChild(no('div', 'vazio', 'NENHUM EPISÓDIO AQUI. O SILÊNCIO REINA.'));
    return;
  }

  const tabela = no('table', 'feed');
  const cab = no('thead');
  const linhaCab = no('tr');
  for (const h of ['TÍTULO', 'PLAY', 'BAIXAR', 'TEMPO']) linhaCab.appendChild(no('th', null, h));
  cab.appendChild(linhaCab);
  tabela.appendChild(cab);

  const corpo = no('tbody');
  for (const p of lista) {
    const tr = no('tr');

    const tdTitulo = no('td', 'titulo');
    const tituloLink = no('a', null, p.title);
    tituloLink.href = urlEpisodio(p);
    tituloLink.target = '_blank';
    tituloLink.rel = 'noopener';
    tdTitulo.appendChild(tituloLink);
    tdTitulo.appendChild(document.createTextNode(' '));
    tdTitulo.appendChild(no('span', 'dono', '[@' + p.ownerLogin + ']'));
    if (!p.isPublic) tdTitulo.appendChild(no('span', 'privado', ' [PRIVADO]'));

    if (state.me) {
      const fav = no('a', 'marcador ' + (state.favoritos.includes(p.id) ? 'on' : 'off'),
        state.favoritos.includes(p.id) ? '★' : '☆');
      fav.href = '#';
      fav.title = 'Favorito';
      fav.addEventListener('click', (e) => { e.preventDefault(); marcar(p, 'favorito'); });
      tdTitulo.appendChild(document.createTextNode(' '));
      tdTitulo.appendChild(fav);

      const dep = no('a', 'marcador ' + (state.depois.includes(p.id) ? 'on' : 'off'),
        state.depois.includes(p.id) ? '◷' : '◴');
      dep.href = '#';
      dep.title = 'Assistir mais tarde';
      dep.addEventListener('click', (e) => { e.preventDefault(); marcar(p, 'depois'); });
      tdTitulo.appendChild(document.createTextNode(' '));
      tdTitulo.appendChild(dep);
    }

    if (p.mine || (state.me && state.me.mod)) {
      const ctrls = no('span', 'controles');
      ctrls.appendChild(document.createTextNode(' '));
      ctrls.appendChild(link('[renomear]', () => renomear(p)));
      ctrls.appendChild(document.createTextNode(' '));
      ctrls.appendChild(link('[' + (p.isPublic ? 'privado' : 'público') + ']', () => alternar(p)));
      ctrls.appendChild(document.createTextNode(' '));
      ctrls.appendChild(link('[apagar]', () => apagar(p)));
      tdTitulo.appendChild(ctrls);
    }
    tr.appendChild(tdTitulo);

    const tdPlay = no('td');
    const botao = no('button', 'btn-play' + (state.tocando === p.id ? ' tocando' : null),
      state.tocando === p.id ? '||' : '>');
    botao.title = state.tocando === p.id ? 'Pausar' : 'Tocar';
    botao.addEventListener('click', () => tocar(p));
    tdPlay.appendChild(botao);
    tr.appendChild(tdPlay);

    const tdDownload = no('td');
    tdDownload.appendChild(link('BAIXAR', () => baixar(p)));
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
  const sufixo = p.isPublic ? '' : '?token=' + encodeURIComponent(state.token);
  player.src = API_BASE + '/api/podcasts/' + encodeURIComponent(p.id) + '/stream' + sufixo;
  player.play()
    .then(() => { state.tocando = p.id; renderFeed(); })
    .catch(() => msg('', true));
}

function baixar(p) {
  const sufixo = p.isPublic ? '' : '?token=' + encodeURIComponent(state.token);
  const a = document.createElement('a');
  a.href = API_BASE + '/api/podcasts/' + encodeURIComponent(p.id) + '/download' + sufixo;
  a.download = p.downloadName || p.originalName || p.title || 'episodio.mp3';
  document.body.appendChild(a);
  a.click();
  a.remove();
  msg('DOWNLOAD INICIADO: ' + p.title);
}

async function marcar(p, tipo) {
  try {
    const r = await api('/api/podcasts/' + encodeURIComponent(p.id) + '/marcador', {
      method: 'POST', body: JSON.stringify({ tipo }),
    });
    state.favoritos = r.favoritos || [];
    state.depois = r.depois || [];
    renderFeed();
  } catch (e) { msg(e.message, e.status ? false : true); }
}

async function renomear(p) {
  const novo = prompt('NOVO TÍTULO:', p.title);
  if (novo === null || !novo.trim()) return;
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), {
      method: 'PATCH', body: JSON.stringify({ title: novo.trim() }),
    });
    msg('TÍTULO ALTERADO.');
    carregar();
  } catch (e) { msg(e.message, e.status ? false : true); }
}

async function alternar(p) {
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), {
      method: 'PATCH', body: JSON.stringify({ isPublic: !p.isPublic }),
    });
    msg(p.isPublic ? 'AGORA É PRIVADO.' : 'AGORA É PÚBLICO.');
    carregar();
  } catch (e) { msg(e.message, e.status ? false : true); }
}

async function apagar(p) {
  if (!confirm('APAGAR "' + p.title + '" PARA SEMPRE? NÃO HÁ VOLTA.')) return;
  try {
    await api('/api/podcasts/' + encodeURIComponent(p.id), { method: 'DELETE' });
    if (state.tocando === p.id) { player.pause(); player.removeAttribute('src'); state.tocando = null; }
    msg('EPISÓDIO APAGADO.');
    carregar();
  } catch (e) { msg(e.message, e.status ? false : true); }
}

async function apagarConta(u) {
  if (!confirm('REMOVER A CONTA "' + u.login + '" E TUDO DELA?')) return;
  try {
    await api('/api/users/' + encodeURIComponent(u.id), { method: 'DELETE' });
    msg('CONTA REMOVIDA.');
    carregar();
  } catch (e) { msg(e.message, e.status ? false : true); }
}

function duracaoDoArquivo(file) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    audio.src = url;
  });
}

async function autenticar(rota) {
  const login = $('login').value.trim();
  const senha = $('senha').value;
  if (!login || !senha) return msg('PREENCHA LOGIN E SENHA.');
  try {
    const dados = await api(rota, { method: 'POST', body: JSON.stringify({ login, senha }) });
    state.token = dados.token;
    localStorage.setItem('podcast_exe_token', state.token);
    $('senha').value = '';
    msg(rota === '/api/register' ? 'CONTA CRIADA. BEM-VINDO AO CLUBE.' : 'LOGIN EFETUADO.');
    await carregar();
  } catch (e) {
    if (e.status === 401) msg('Login e/ou senha incorretos. Tente novamente.');
    else if (e.status >= 400 && e.status < 500) msg(e.message);
    else msg('', true);
  }
}

async function trocarSenha() {
  const atual = $('senha-atual').value;
  const nova = $('senha-nova').value;
  if (!atual || !nova) return msg('PREENCHA A SENHA ATUAL E A NOVA.');
  try {
    await api('/api/senha', { method: 'POST', body: JSON.stringify({ senhaAtual: atual, novaSenha: nova }) });
    $('trocar-panel').hidden = true;
    $('senha-atual').value = '';
    $('senha-nova').value = '';
    msg('SENHA TROCADA.');
  } catch (e) {
    if (e.status >= 400 && e.status < 500) msg(e.message);
    else msg('', true);
  }
}

async function sair() {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) { /* já saiu */ }
  state.token = '';
  state.me = null;
  state.filter = null;
  localStorage.removeItem('podcast_exe_token');
  msg('VOCÊ SAIU. ATÉ A PRÓXIMA.');
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
      msg(`ENVIANDO ${barra(pct)} ${pct}% (${mb(e.loaded)}/${mb(e.total)} MB)`);
    };
    xhr.onload = () => {
      let dados = {};
      try { dados = JSON.parse(xhr.responseText); } catch (_) { /* resposta vazia */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(dados);
      else reject(new Error(dados.error || 'ERRO HTTP ' + xhr.status));
    };
    xhr.onerror = () => reject(new Error('FALHA DE REDE DURANTE O UPLOAD'));
    xhr.send(formData);
  });
}

async function fazerUpload() {
  const arquivo = $('arquivo').files[0];
  const imagem = $('imagem').files[0];
  if (!arquivo) return msg('ESCOLHA UM ARQUIVO PRIMEIRO.');
  if (imagem && imagem.size > 1024 * 1024) return msg('A IMAGEM PRECISA TER NO MÁXIMO 1MB.');
  msg('LENDO O ÁUDIO E CALCULANDO A DURAÇÃO...');
  const duracao = await duracaoDoArquivo(arquivo);
  if (duracao < 300) return msg('EPISÓDIOS PRECISAM TER PELO MENOS 5 MINUTOS.');

  const dados = new FormData();
  dados.append('arquivo', arquivo);
  if (imagem) dados.append('imagem', imagem);
  dados.append('title', $('titulo').value);
  dados.append('description', $('descricao').value);
  dados.append('isPublic', $('publico').checked ? '1' : '0');
  dados.append('duration', String(duracao));

  msg('ENVIANDO... NÃO DESLIGUE O MODEM.');
  try {
    await enviarComProgresso(dados);
    $('arquivo').value = '';
    $('imagem').value = '';
    $('titulo').value = '';
    $('descricao').value = '';
    msg('EPISÓDIO PUBLICADO NO FEED!');
    await carregar();
  } catch (e) { msg(e.message, e.status ? false : true); }
}

$('btn-entrar').addEventListener('click', () => autenticar('/api/login'));
$('btn-criar').addEventListener('click', () => autenticar('/api/register'));
$('btn-sair').addEventListener('click', sair);
$('btn-upload').addEventListener('click', fazerUpload);
$('btn-trocar').addEventListener('click', () => { $('trocar-panel').hidden = !$('trocar-panel').hidden; });
$('btn-cancela-senha').addEventListener('click', () => { $('trocar-panel').hidden = true; });
$('btn-confirmar-senha').addEventListener('click', trocarSenha);
$('busca').addEventListener('input', () => { state.busca = $('busca').value; renderFeed(); });

$('senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') autenticar('/api/login'); });
$('login').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('senha').focus(); });

player.addEventListener('ended', () => { state.tocando = null; renderFeed(); });

if (NO_PAGES) {
  msg('MODO PAGES: O SERVIDOR LOCAL EM localhost:3000 PRECISA ESTAR LIGADO. SE O CHROME PEDIR PERMISSÃO DE REDE LOCAL, PERMITA.');
}

api('/api/hits')
  .then((d) => { $('hits').textContent = d.hits; })
  .catch(() => { $('hits').textContent = '???'; msg('', true); });

window.addEventListener('unhandledrejection', () => msg('', true));
window.addEventListener('error', () => msg('', true));

carregar(true);
