import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_FORM_URL = import.meta.env.VITE_GOOGLE_FORM_URL;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

let isEditor = false;
let currentPosts = [];

// Mencegah celah XSS saat menampilkan teks dari database
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render Kotak Aspirasi (Google Form)
function renderGoogleForm() {
  const container = document.getElementById('gform-container');
  if (!GOOGLE_FORM_URL) {
    container.innerHTML = `<p class="muted-text">Link Google Form belum diatur di file <code>.env</code> (variabel <code>VITE_GOOGLE_FORM_URL</code>).</p>`;
    return;
  }
  const embedUrl = GOOGLE_FORM_URL.includes('embedded=true')
    ? GOOGLE_FORM_URL
    : `${GOOGLE_FORM_URL}${GOOGLE_FORM_URL.includes('?') ? '&' : '?'}embedded=true`;

  container.innerHTML = `
    <iframe class="gform-iframe" src="${escapeHtml(embedUrl)}" title="Kotak Aspirasi OSIS SMAN 26">Memuat formulir...</iframe>
    <div style="margin-top: 14px; text-align: right;">
      <a href="${escapeHtml(GOOGLE_FORM_URL)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">
        Buka Formulir di Tab Baru
      </a>
    </div>
  `;
}

// Cek apakah akun yang login terdaftar di tabel editors
async function checkEditorStatus() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    setEditorUI(false);
    return;
  }

  const { data } = await supabase
    .from('editors')
    .select('email')
    .eq('email', session.user.email)
    .maybeSingle();

  setEditorUI(Boolean(data));
}

function setEditorUI(active) {
  isEditor = active;
  const authBtn = document.getElementById('auth-btn');
  const badge = document.getElementById('editor-badge');

  badge.classList.toggle('hidden', !active);
  authBtn.textContent = active ? 'Keluar' : 'Login Editor';

  document.querySelectorAll('.editor-only').forEach((el) => {
    el.classList.toggle('hidden', !active);
  });

  loadPosts();
  loadAgendas();
}

// Muat Berita Jurnalistik
async function loadPosts() {
  const grid = document.getElementById('posts-grid');
  if (!supabase) {
    grid.innerHTML = `<p class="muted-text">Hubungkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di file <code>.env</code> untuk menampilkan berita.</p>`;
    return;
  }

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = `<p class="muted-text">Gagal memuat berita.</p>`;
    return;
  }

  currentPosts = data || [];
  if (currentPosts.length === 0) {
    grid.innerHTML = `<p class="muted-text">Belum ada berita yang dipublikasikan.</p>`;
    return;
  }

  grid.innerHTML = currentPosts
    .map((post) => {
      const dateStr = new Date(post.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return `
        <article class="card glass">
          ${post.image_url ? `<img class="post-thumb" src="${escapeHtml(post.image_url)}" alt="${escapeHtml(post.title)}" />` : ''}
          <span class="role-badge">${escapeHtml(post.category)}</span>
          <h3 class="post-title" data-read="${post.id}">${escapeHtml(post.title)}</h3>
          <p class="post-excerpt">${escapeHtml(post.content)}</p>
          <div class="card-footer">
            <span class="muted-text">${dateStr}</span>
            <div class="editor-controls">
              <button class="btn btn-outline btn-small" data-read="${post.id}">Baca</button>
              ${
                isEditor
                  ? `<button class="btn btn-glass btn-small" data-edit-post="${post.id}">Edit</button>
                     <button class="btn btn-danger" data-delete-post="${post.id}">Hapus</button>`
                  : ''
              }
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

// Muat Agenda Kegiatan
async function loadAgendas() {
  const list = document.getElementById('agendas-list');
  if (!supabase) {
    list.innerHTML = `<p class="muted-text">Menunggu koneksi Supabase.</p>`;
    return;
  }

  const { data, error } = await supabase
    .from('agendas')
    .select('*')
    .order('event_date', { ascending: true });

  if (error || !data || data.length === 0) {
    list.innerHTML = `<p class="muted-text">Belum ada agenda kegiatan terdaftar.</p>`;
    return;
  }

  list.innerHTML = data
    .map((item) => {
      const d = new Date(item.event_date + 'T00:00:00');
      const day = d.getDate();
      const month = d.toLocaleDateString('id-ID', { month: 'short' });
      return `
        <article class="agenda-item glass">
          <div class="agenda-left">
            <div class="agenda-date-box">
              <div>${day}</div>
              <small>${month}</small>
            </div>
            <div class="agenda-info">
              <h3>${escapeHtml(item.title)}</h3>
              <p class="muted-text">${escapeHtml(item.location)}${item.description ? ' • ' + escapeHtml(item.description) : ''}</p>
            </div>
          </div>
          ${
            isEditor
              ? `<button class="btn btn-danger" data-delete-agenda="${item.id}">Hapus</button>`
              : ''
          }
        </article>
      `;
    })
    .join('');
}

// Upload Foto ke Bucket Supabase Storage
async function uploadImage(file) {
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(fileName, file);
  if (error) throw error;

  const { data } = supabase.storage.from('media').getPublicUrl(fileName);
  return data.publicUrl;
}

// Pengelolaan Modal
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// Tombol Login / Logout
document.getElementById('auth-btn').addEventListener('click', async () => {
  if (isEditor && supabase) {
    await supabase.auth.signOut();
    setEditorUI(false);
  } else {
    openModal('login-modal');
  }
});

// Submit Login Editor
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  if (!supabase) {
    errEl.textContent = 'Supabase belum dikonfigurasi di .env';
    errEl.classList.remove('hidden');
    return;
  }

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = 'Email atau kata sandi salah.';
    errEl.classList.remove('hidden');
    return;
  }

  await checkEditorStatus();
  if (!isEditor) {
    await supabase.auth.signOut();
    errEl.textContent = 'Akun ini tidak memiliki izin Editor.';
    errEl.classList.remove('hidden');
    return;
  }

  e.target.reset();
  closeModal('login-modal');
});

// Buka Modal Tambah Berita
document.getElementById('add-post-btn').addEventListener('click', () => {
  document.getElementById('post-modal-title').textContent = 'Tambah Berita';
  document.getElementById('post-form').reset();
  document.getElementById('post-id').value = '';
  document.getElementById('post-existing-image').value = '';
  openModal('post-modal');
});

// Submit Berita (Tambah / Edit)
document.getElementById('post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('post-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const id = document.getElementById('post-id').value;
    const title = document.getElementById('post-title').value.trim();
    const category = document.getElementById('post-category').value;
    const content = document.getElementById('post-content').value.trim();
    const fileInput = document.getElementById('post-image-file');
    let image_url = document.getElementById('post-existing-image').value || null;

    if (fileInput.files.length > 0) {
      image_url = await uploadImage(fileInput.files[0]);
    }

    if (id) {
      await supabase.from('posts').update({ title, category, content, image_url }).eq('id', id);
    } else {
      await supabase.from('posts').insert([{ title, category, content, image_url }]);
    }

    closeModal('post-modal');
    await loadPosts();
  } catch (err) {
    alert('Gagal menyimpan berita: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publikasikan';
  }
});

// Buka & Submit Modal Agenda
document.getElementById('add-agenda-btn').addEventListener('click', () => {
  document.getElementById('agenda-form').reset();
  openModal('agenda-modal');
});

document.getElementById('agenda-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('agenda-title').value.trim();
  const event_date = document.getElementById('agenda-date').value;
  const location = document.getElementById('agenda-location').value.trim();
  const description = document.getElementById('agenda-desc').value.trim();

  const { error } = await supabase
    .from('agendas')
    .insert([{ title, event_date, location, description }]);

  if (error) {
    alert('Gagal menyimpan agenda: ' + error.message);
    return;
  }
  closeModal('agenda-modal');
  await loadAgendas();
});

// Event Delegation untuk Baca, Edit, dan Hapus
document.addEventListener('click', async (e) => {
  const readId = e.target.dataset.read;
  if (readId) {
    const post = currentPosts.find((p) => p.id === readId);
    if (!post) return;
    document.getElementById('reader-category').textContent = post.category;
    document.getElementById('reader-title').textContent = post.title;
    document.getElementById('reader-meta').textContent = new Date(post.created_at).toLocaleDateString('id-ID', {
      dateStyle: 'long',
    });
    document.getElementById('reader-content').textContent = post.content;
    const imgEl = document.getElementById('reader-image');
    if (post.image_url) {
      imgEl.src = post.image_url;
      imgEl.classList.remove('hidden');
    } else {
      imgEl.classList.add('hidden');
    }
    openModal('reader-modal');
  }

  const editId = e.target.dataset.editPost;
  if (editId) {
    const post = currentPosts.find((p) => p.id === editId);
    if (!post) return;
    document.getElementById('post-modal-title').textContent = 'Edit Berita';
    document.getElementById('post-id').value = post.id;
    document.getElementById('post-title').value = post.title;
    document.getElementById('post-category').value = post.category;
    document.getElementById('post-content').value = post.content;
    document.getElementById('post-existing-image').value = post.image_url || '';
    openModal('post-modal');
  }

  const deletePostId = e.target.dataset.deletePost;
  if (deletePostId && confirm('Hapus berita ini secara permanen?')) {
    await supabase.from('posts').delete().eq('id', deletePostId);
    await loadPosts();
  }

  const deleteAgendaId = e.target.dataset.deleteAgenda;
  if (deleteAgendaId && confirm('Hapus agenda ini?')) {
    await supabase.from('agendas').delete().eq('id', deleteAgendaId);
    await loadAgendas();
  }
});

// Inisialisasi Awal
renderGoogleForm();
checkEditorStatus();
