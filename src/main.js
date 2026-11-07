const sidebar = document.querySelector('#sidebar');
const mobileMenu = document.querySelector('#mobileMenu');
const modal = document.querySelector('#noticeModal');
const closeModalButton = document.querySelector('#closeModal');
const confirmModalButton = document.querySelector('#confirmModal');
const searchInput = document.querySelector('#treeSearch');
const emptyTitle = document.querySelector('.empty-state h3');
const emptyDescription = document.querySelector('.empty-state p');

function openNotice() {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  closeModalButton.focus();
}

function closeNotice() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

document.querySelectorAll('#newTreeButton, #emptyNewTree, #profileButton, #filterButton').forEach((button) => {
  button.addEventListener('click', openNotice);
});

closeModalButton.addEventListener('click', closeNotice);
confirmModalButton.addEventListener('click', closeNotice);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeNotice();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeNotice();
});

mobileMenu.addEventListener('click', () => {
  const isOpen = sidebar.classList.toggle('open');
  mobileMenu.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
    sidebar.classList.remove('open');
    mobileMenu.setAttribute('aria-expanded', 'false');
  });
});

searchInput.addEventListener('input', () => {
  const hasSearch = searchInput.value.trim().length > 0;
  emptyTitle.textContent = hasSearch ? 'Nenhum registro encontrado' : 'O inventário está começando';
  emptyDescription.textContent = hasSearch
    ? 'Ainda não há árvores cadastradas para corresponder a esta busca. Os registros aparecerão após o levantamento de campo.'
    : 'Os registros das árvores aparecerão aqui após o levantamento de campo e a integração com o banco de dados.';
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// DAP (cm) is calculated from CAP (cm) using the relation defined in the project.
export function calculateDap(capCm) {
  const cap = Number(capCm);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return Number((cap / Math.PI).toFixed(1));
}

document.documentElement.dataset.app = 'arvores-de-nazareno';


// Registra o service worker para permitir instalação e atualização do PWA.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL
    }).catch((error) => {
      console.error('Não foi possível registrar o service worker:', error);
    });
  });
}
