// Petite boîte de confirmation intégrée (les dialogues natifs ne sont pas toujours disponibles).
export function ask(title, ok = 'Confirmer', danger = true) {
  return new Promise((res) => {
    const el = document.createElement('div');
    el.className = 'ask';
    el.innerHTML = `<div class="ask-card" role="alertdialog" aria-modal="true"><p></p><div class="dlg-btns"><button class="btn btn-soft" data-v="0">Annuler</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-v="1"></button></div></div>`;
    el.querySelector('p').textContent = title;
    el.querySelector('[data-v="1"]').textContent = ok;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b && e.target !== el) return;
      el.classList.remove('open'); setTimeout(() => el.remove(), 250);
      res(b ? b.dataset.v === '1' : false);
    });
  });
}
