'use strict';

const $ = (id) => document.getElementById(id);
const player = $('player');
const token = localStorage.getItem('podcast_exe_token') || '';

const NO_PAGES = ['gabrielrpoubel.github.io', 'tudocasts.com.br', 'www.tudocasts.com.br', 'tudocasts.com', 'www.tudocasts.com']
  .includes(location.hostname.toLowerCase());
const API_BASE = NO_PAGES ? 'http://localhost:3000' : '';
const BASE_PATH = location.pathname.startsWith('/tudocasts-site') ? '/tudocasts-site' : '';

function statusEp(texto, erro) {
  const el = $('status-ep');
  el.textContent = erro ? t('INDISPONIVEL') : texto;
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
  return urlComIdioma(BASE_PATH + '/' + encodeURIComponent(p.ownerLogin) + '/' + encodeURIComponent(slug(p.title)));
}

function urlDoAutor(login) {
  return urlComIdioma(BASE_PATH + '/?user=' + encodeURIComponent(login));
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

function link(texto, href) {
  const a = no('a', null, texto);
  a.href = href;
  return a;
}

function aplicarTraducao() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.documentElement.lang = idiomaAtual;
  document.querySelectorAll('#menu-idioma button').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.lang === idiomaAtual);
  });
  $('texto-comentario').placeholder = t('SEU_COMENTARIO');
}

let episodio = null;
let eu = null;

function renderComentarios(lista) {
  const box = $('comentarios');
  box.textContent = '';
  if (lista.length === 0) {
    box.appendChild(no('div', 'vazio', t('SEM_COMENTARIOS')));
    return;
  }
  const locale = idiomaAtual === 'en' ? 'en-US' : idiomaAtual === 'es' ? 'es-ES' : 'pt-BR';
  for (const c of lista) {
    const div = no('div', 'comentario');
    const cab = no('div');
    const autorComentario = link('@' + c.userLogin, urlDoAutor(c.userLogin));
    autorComentario.className = 'quem';
    cab.appendChild(autorComentario);
    cab.appendChild(no('span', 'data', new Date(c.createdAt).toLocaleString(locale)));
    if (c.removivel) {
      const apagar = link(' ' + t('REMOVER'), '#');
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
  if (!texto) return statusEp(t('ESCREVA'));
  try {
    await api('/api/podcasts/' + encodeURIComponent(episodio.id) + '/comments', {
      method: 'POST', body: JSON.stringify({ texto }),
    });
    $('texto-comentario').value = '';
    await carregarComentarios();
    statusEp(t('COMENTARIO_OK'));
  } catch (e) {
    statusEp(e.status >= 400 && e.status < 500 ? tErro(e.message) : '', !e.status);
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
      statusEp(t('VELOCIDADE', b.textContent));
    });
  }
}

async function main() {
  $('voltar').href = urlComIdioma(BASE_PATH + '/');
  $('comentarios-titulo').textContent = t('COMENTARIOS');
  $('btn-comentar').textContent = t('COMENTAR');

  const partes = location.pathname.split('/').filter(Boolean);
  if (partes[0] === 'tudocasts-site') partes.shift();
  if (partes.length < 2) {
    statusEp(t('SEM_EP'));
    return;
  }
  const autor = decodeURIComponent(partes[0]);
  const titulo = decodeURIComponent(partes.slice(1).join('/'));

  try {
    const [resultado, info] = await Promise.all([api('/api/podcasts?lang=all'), api('/api/me')]);
    eu = info.user;
    episodio = resultado.find((p) => p.ownerLogin === autor && slug(p.title) === titulo);
    if (!episodio) {
      statusEp(t('SEM_EP'));
      return;
    }

    $('pagina').hidden = false;
    $('status-ep').hidden = true;
    $('titulo').textContent = episodio.title;
    $('autor').textContent = '';
    $('autor').appendChild(link('@' + episodio.ownerLogin, urlDoAutor(episodio.ownerLogin)));
    $('autor').appendChild(document.createTextNode(' · ' + tempo(episodio.duration)));
    $('descricao').textContent = episodio.description || t('SEM_DESCRICAO');
    $('sem-capa').textContent = t('SEM_IMAGEM');

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
    if (i > 0) $('anterior').appendChild(link(t('ULTIMO'), urlEpisodio(daSequencia[i - 1])));
    if (i >= 0 && i < daSequencia.length - 1) {
      $('proximo').appendChild(link(t('PROXIMO'), urlEpisodio(daSequencia[i + 1])));
    }

    if (eu) $('form-comentario').hidden = false;

    if (eu && (episodio.mine || eu.mod)) {
      const acoes = $('acoes');
      if (episodio.image) {
        const removerImagem = link(t('REMOVER_IMG'), '#');
        removerImagem.addEventListener('click', async (e) => {
          e.preventDefault();
          try {
            await api('/api/podcasts/' + encodeURIComponent(episodio.id) + '/image', { method: 'DELETE' });
            $('capa').hidden = true;
            $('sem-capa').hidden = false;
            statusEp(t('IMG_REMOVIDA'));
          } catch (err) { statusEp(err.status >= 400 && err.status < 500 ? tErro(err.message) : '', !err.status); }
        });
        acoes.appendChild(removerImagem);
        acoes.appendChild(document.createTextNode(' '));
      }
      const trocarImagem = link(t('TROCAR_IMG'), '#');
      trocarImagem.addEventListener('click', (e) => {
        e.preventDefault();
        $('troca-imagem-ep').value = '';
        $('troca-imagem-ep').click();
      });
      acoes.appendChild(trocarImagem);

      if (eu.mod) {
        acoes.appendChild(document.createTextNode(' '));
        const apagarEpisodio = link(t('APAGAR_EP'), '#');
        apagarEpisodio.addEventListener('click', async (e) => {
          e.preventDefault();
          if (!confirm(t('APAGAR_EP_CONFIRMA'))) return;
          try {
            await api('/api/podcasts/' + encodeURIComponent(episodio.id), { method: 'DELETE' });
            location.href = urlComIdioma(BASE_PATH + '/');
          } catch (err) { statusEp('', !err.status); }
        });
        acoes.appendChild(apagarEpisodio);
      }
    }

    await carregarComentarios();
  } catch (e) {
    statusEp('', !e.status);
  }
}

$('troca-imagem-ep').addEventListener('change', async () => {
  const arquivo = $('troca-imagem-ep').files[0];
  if (!arquivo || !episodio) return;
  if (arquivo.size > 1024 * 1024) return statusEp(t('IMG_GRANDE'));
  const dados = new FormData();
  dados.append('imagem', arquivo);
  try {
    await api('/api/podcasts/' + encodeURIComponent(episodio.id) + '/image', { method: 'POST', body: dados });
    location.reload();
  } catch (e) { statusEp(e.status >= 400 && e.status < 500 ? tErro(e.message) : '', !e.status); }
});

$('btn-idioma').addEventListener('click', () => { $('menu-idioma').hidden = !$('menu-idioma').hidden; });
document.querySelectorAll('#menu-idioma button').forEach((b) => {
  b.addEventListener('click', () => {
    const destino = new URL(location.href);
    destino.searchParams.set('lang', b.dataset.lang);
    location.href = destino.toString();
  });
});

$('btn-comentar').addEventListener('click', comentar);
$('texto-comentario').addEventListener('keydown', (e) => { if (e.key === 'Enter') comentar(); });
window.addEventListener('unhandledrejection', () => statusEp('', true));

aplicarTraducao();
main();
