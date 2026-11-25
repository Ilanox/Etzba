// Small things every page of the website does. Works without it too: sharing then opens WhatsApp.

// "Send to a friend": the phone's own share sheet when there is one
for (const a of document.querySelectorAll('[data-share]')) {
  if (!navigator.share) continue;
  a.addEventListener('click', e => {
    e.preventDefault();
    navigator.share({ title: a.dataset.title, text: a.dataset.title, url: a.dataset.url }).catch(() => {});
  });
}

// the embed page: copy the code
for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', () => {
    const src = document.getElementById(b.dataset.copy);
    navigator.clipboard?.writeText(src.textContent).then(() => { b.textContent = 'הועתק'; setTimeout(() => { b.textContent = 'להעתיק'; }, 1600); }, () => {
      const r = document.createRange(); r.selectNodeContents(src); getSelection().removeAllRanges(); getSelection().addRange(r);
    });
  });
}
