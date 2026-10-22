(() => {
  function ensureDialog() {
    let dialog = document.querySelector('#availabilityQrDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'availabilityQrDialog';
    dialog.className = 'availability-qr-dialog';
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = '填写链接二维码';
    const image = document.createElement('img');
    image.alt = '空闲时间问卷填写链接二维码';
    const hint = document.createElement('p');
    hint.textContent = '扫码后无需登录即可填写。';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'availability-button primary';
    close.textContent = '关闭';
    close.addEventListener('click', () => dialog.close());
    content.append(title, image, hint, close);
    dialog.append(content);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    document.body.append(dialog);
    return dialog;
  }

  function showQr(url) {
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const dialog = ensureDialog();
    dialog.querySelector('img').src = qr.createDataURL(8, 16);
    dialog.showModal();
  }

  function enhance() {
    const link = [...document.querySelectorAll('a.availability-button[href*="/tools/availability/"]')]
      .find(node => !node.href.includes('/result/') && !node.href.endsWith('/admin'));
    if (!link || link.parentElement.querySelector('[data-availability-qr]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'availability-button';
    button.dataset.availabilityQr = 'true';
    button.textContent = '显示二维码';
    button.addEventListener('click', () => showQr(link.href));
    link.before(button);
  }

  new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', enhance);
})();
