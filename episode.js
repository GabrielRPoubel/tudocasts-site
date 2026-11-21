'use strict';

const $ = (id) => document.getElementById(id);
const player = $('player');
const token = localStorage.getItem('podcast_exe_token') || '';

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
const MSG_INDISPONIVEL = 'Servidor indisponível. Manutenção em breve. Por favor, volte mais tarde.';

function statusEp(texto, erro) {
  const el = $('status-ep');
  el.textContent = erro ? MSG_INDISPONIVEL : texto;
  el.style.color = erro ? '#fff' : '#b3b3b3';
}

async function api(caminho, opcoes = {}) {
  const headers = Object.assign({}, opcoes.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  if (opcoes.body && !(opcoes.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const init = { ...opcoes, headers };
  if (NO_PAGES) init.targetAddressSpace = 'loopback';
  const resposta = await fetch(API_BASE + caminho, init);
  let dados = {};
  try { dados = await resposta.json(); } catch (_) { /* vazio */ }
  if (!resposta.ok) {
    const e = new Error(dados.error || 'ERRO HTTP ' + resposta.status);
    e.status = resposta.status;
    throw e;
  }
  return dados;
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

function tempo(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function no(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function link(texto, href, externo) {
  const a = no('a', null, texto);
  a.href = href;
  if (externo) { a.target = '_blank'; a.rel = 'noopener'; }
  return a;
}

let episodio = null;
let eu = null;

function renderComentarios(lista) {
  const box = $('comentarios');
  box.textContent = '';
  if (lista.length === 0) {
    box.appendChild(no('div', 'vazio', 'NINGUÉM COMENTOU AINDA.'));
    return;
  }
  for (const c of lista) {
    const div = no('div', 'comentario');
    const cab = no('div');
    cab.appendChild(no('span', 'quem', '@' + c.userLogin));
    cab.appendChild(no('span', 'data', new Date(c.createdAt).toLocaleString('pt-BR')));
    if (c.removivel) {
      const apagar = link(' [remover]', '#');
      apagar.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await api('/api/comments/' + encodeURIComponent(c.id), { method: 'DELETE' });
          await carregarComentarios();
        } catch (err) { statusEp('', !err.status); }
      });
      cab.appendChild(apagar);
    }
    div.appendChild(cab);
    div.appendChild(no('div', 'texto', c.texto));
    box.appendChild(div);
  }
}

async function carregarComentarios() {
  try {
    renderComentarios(await api('/api/podcasts/' + encodeURIComponent(episodio.id) + '/comments'));
  } catch (e) { statusEp('', !e.status); }
}

async function comentar() {
  const texto = $('texto-comentario').value.trim();
  if (!texto) return statusEp('ESCREVA ALGO ANTES DE COMENTAR.');
  try {
    await api('/api/podcasts/' + encodeURIComponent(episodio.id) + '/comments', {
      method: 'POST', body: JSON.stringify({ texto }),
    });
    $('texto-comentario').value = '';
    await carregarComentarios();
    statusEp('COMENTÁRIO PUBLICADO.');
  } catch (e) {
    statusEp(e.status >= 400 && e.status < 500 ? e.message : '', !e.status);
  }
}

function configurarAudio() {
  const sufixo = episodio.isPublic ? '' : '?token=' + encodeURIComponent(token);
  player.src = API_BASE + '/api/podcasts/' + encodeURIComponent(episodio.id) + '/stream' + sufixo;
  $('total').textContent = tempo(episodio.duration);

  $('play').addEventListener('click', () => {
    if (player.paused) player.play().catch(() => statusEp('', true));
    else player.pause();
    $('play').textContent = player.paused ? '>' : '||';
  });
  player.addEventListener('play', () => { $('play').textContent = '||'; });
  player.addEventListener('pause', () => { $('play').textContent = '>'; });
  player.addEventListener('ended', () => { $('play').textContent = '>'; });
  player.addEventListener('timeupdate', () => {
    if (!player.duration) return;
    $('atual').textContent = tempo(player.currentTime);
    $('progresso').value = String(Math.round((player.currentTime / player.duration) * 1000));
  });
  $('progresso').addEventListener('input', () => {
    if (!player.duration) return;
    player.currentTime = (Number($('progresso').value) / 1000) * player.duration;
  });

  for (const b of $('velocidades').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      player.playbackRate = Number(b.dataset.v);
      statusEp('VELOCIDADE ' + b.textContent);
    });
  }
}

async function main() {
  $('voltar').href = BASE_PATH + '/';

  const partes = location.pathname.split('/').filter(Boolean);
  if (partes[0] === 'tudocasts-site') partes.shift();
  if (partes.length < 2) {
    statusEp('EPISÓDIO NÃO ENCONTRADO.');
    return;
  }
  const autor = decodeURIComponent(partes[0]);
  const titulo = decodeURIComponent(partes.slice(1).join('/'));

  try {
    const [resultado, info] = await Promise.all([api('/api/podcasts'), api('/api/me')]);
    eu = info.user;
    episodio = resultado.find((p) => p.ownerLogin === autor && slug(p.title) === titulo);
    if (!episodio) {
      statusEp('EPISÓDIO NÃO ENCONTRADO.');
      return;
    }

    $('pagina').hidden = false;
    $('status-ep').hidden = true;
    $('titulo').textContent = episodio.title;
    $('autor').textContent = 'por @' + episodio.ownerLogin + ' · ' + tempo(episodio.duration);
    $('descricao').textContent = episodio.description || '(SEM DESCRIÇÃO)';

    if (episodio.image) {
      $('capa').src = API_BASE + '/api/imagem/' + encodeURIComponent(episodio.image);
      $('capa').hidden = false;
    } else {
      $('sem-capa').hidden = false;
    }

    configurarAudio();

    const daSequencia = resultado
      .filter((p) => p.ownerLogin === episodio.ownerLogin)
      .sort((a, b) => b.createdAt - a.createdAt);
    const i = daSequencia.findIndex((p) => p.id === episodio.id);
    if (i > 0) $('anterior').appendChild(link('<< ÚLTIMO EPISÓDIO', urlEpisodio(daSequencia[i - 1])));
    if (i >= 0 && i < daSequencia.length - 1) {
      $('proximo').appendChild(link('PRÓXIMO >>', urlEpisodio(daSequencia[i + 1])));
    }

    if (eu) $('form-comentario').hidden = false;

    if (eu && eu.mod) {
      const acoes = $('acoes');
      const removerImagem = link('[remover imagem]', '#');
      removerImagem.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await api('/api/podcasts/' + encodeURIComponent(episodio.id) + '/image', { method: 'DELETE' });
          $('capa').hidden = true;
          $('sem-capa').hidden = false;
          statusEp('IMAGEM REMOVIDA.');
        } catch (err) { statusEp(err.status >= 400 && err.status < 500 ? err.message : '', !err.status); }
      });
      const apagarEpisodio = link('[apagar episódio]', '#');
      apagarEpisodio.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('APAGAR ESSE EPISÓDIO?')) return;
        try {
          await api('/api/podcasts/' + encodeURIComponent(episodio.id), { method: 'DELETE' });
          location.href = BASE_PATH + '/';
        } catch (err) { statusEp('', !err.status); }
      });
      acoes.appendChild(removerImagem);
      acoes.appendChild(document.createTextNode(' '));
      acoes.appendChild(apagarEpisodio);
    }

    await carregarComentarios();
  } catch (e) {
    statusEp('', !e.status);
  }
}

$('btn-comentar').addEventListener('click', comentar);
$('texto-comentario').addEventListener('keydown', (e) => { if (e.key === 'Enter') comentar(); });
window.addEventListener('unhandledrejection', () => statusEp('', true));

main();
