(() => {
  const root = document.querySelector('.section.is--vad-pro');
  const hero = root?.querySelector('.vad__hero-wrap');
  const highlight = root?.querySelector(':scope > .vad__hero-wrap > .highlight__wrapper');
  const cards = root?.querySelector(':scope > .cards__wrap');

  if (!root || !hero || (!highlight && !cards) || document.querySelector('.mbzoey-hero-below')) return;

  const below = document.createElement('section');
  below.className = 'mbzoey-hero-below';
  below.setAttribute('aria-label', 'Mbzoey 产品亮点');
  root.insertAdjacentElement('afterend', below);
  if (highlight) below.appendChild(highlight);
  if (cards) below.appendChild(cards);
})();
