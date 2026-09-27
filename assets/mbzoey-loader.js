(() => {
  const loader = document.querySelector('.mbzoey-page-loader');
  if (!loader) return;

  const startedAt = performance.now();
  const minimumVisibleMs = 420;
  let finished = false;

  const waitForImage = (src) => new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
    if (image.complete) resolve();
  });

  const reveal = () => {
    if (finished) return;
    finished = true;
    const delay = Math.max(0, minimumVisibleMs - (performance.now() - startedAt));
    window.setTimeout(() => {
      loader.classList.add('is-ready');
      window.setTimeout(() => loader.remove(), 760);
    }, delay);
  };

  const criticalImages = [
    'assets/mbzoey-beard-mask.webp',
    'assets/mbzoey-person-region-mask-v2.png',
    'assets/mbzoey-shaver-cursor.webp',
  ];

  Promise.allSettled([
    ...criticalImages.map(waitForImage),
    document.fonts?.ready || Promise.resolve(),
  ]).then(reveal);

  // A broken or unusually slow asset must never leave the page behind the veil.
  window.setTimeout(reveal, 2200);
})();
