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

  const interaction = document.createElement('div');
  interaction.className = 'mbzoey-shave-interaction';
  interaction.setAttribute('aria-label', '移动剃须刀体验剃须效果');
  interaction.innerHTML = `
    <canvas class="mbzoey-shave-canvas mbzoey-shave-base" aria-hidden="true"></canvas>
    <canvas class="mbzoey-shave-canvas mbzoey-shave-reveal" aria-hidden="true"></canvas>
    <img class="mbzoey-shaver-cursor" src="assets/mbzoey-shaver-cursor.png" alt="" aria-hidden="true">
    <span class="mbzoey-shave-hint">移动剃须刀，点击或按住剃须</span>
  `;
  hero.prepend(interaction);

  const baseCanvas = interaction.querySelector('.mbzoey-shave-base');
  const revealCanvas = interaction.querySelector('.mbzoey-shave-reveal');
  const cursor = interaction.querySelector('.mbzoey-shaver-cursor');
  // Start with the bearded portrait (图一) and reveal the clean portrait
  // (图二) through the feathered shave mask.
  const background = new Image();
  const maskImage = new Image();
  background.src = 'assets/mbzoey-beard-mask.png';
  maskImage.src = 'assets/mbzoey-beard-base.png';

  const state = {points: [], active: false, rect: null, scale: 1, offsetX: 0, offsetY: 0};
  const source = {width: 2304, height: 1728};
  const beardRegion = {left: 1000, top: 490, right: 1370, bottom: 900};

  const setupCanvas = (canvas, rect, dpr) => {
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return context;
  };

  const imageLayout = (rect) => {
    const coverScale = Math.max(rect.width / source.width, rect.height / source.height);
    const narrow = rect.width < 640;
    const zoom = narrow ? 1.08 : 1.12;
    const shiftY = Math.min(
      Math.max(rect.height * (narrow ? 0.07 : 0.14), narrow ? 28 : 56),
      narrow ? 80 : 150,
    );
    state.scale = coverScale * zoom;
    const width = source.width * state.scale;
    const height = source.height * state.scale;
    state.offsetX = (rect.width - width) / 2;
    state.offsetY = (rect.height - height) / 2 + shiftY;
  };

  const pointToSource = (event) => {
    const rect = state.rect;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return {x: (x - state.offsetX) / state.scale, y: (y - state.offsetY) / state.scale};
  };

  const isInBeard = ({x, y}) => (
    x >= beardRegion.left && x <= beardRegion.right &&
    y >= beardRegion.top && y <= beardRegion.bottom
  );

  const drawCover = (context, image, rect) => {
    context.clearRect(0, 0, rect.width, rect.height);
    context.drawImage(
      image,
      state.offsetX,
      state.offsetY,
      source.width * state.scale,
      source.height * state.scale,
    );
  };

  const draw = () => {
    if (!state.rect || !background.complete || !maskImage.complete) return;
    const dpr = window.devicePixelRatio || 1;
    const baseContext = setupCanvas(baseCanvas, state.rect, dpr);
    const revealContext = setupCanvas(revealCanvas, state.rect, dpr);
    drawCover(baseContext, background, state.rect);
    drawCover(revealContext, maskImage, state.rect);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = revealCanvas.width;
    maskCanvas.height = revealCanvas.height;
    const maskContext = maskCanvas.getContext('2d');
    maskContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    maskContext.clearRect(0, 0, state.rect.width, state.rect.height);
    for (const point of state.points) {
      const x = state.offsetX + point.x * state.scale;
      const y = state.offsetY + point.y * state.scale;
      const radius = 112 * state.scale;
      const gradient = maskContext.createRadialGradient(x, y, radius * 0.18, x, y, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.68, 'rgba(255,255,255,.88)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      maskContext.fillStyle = gradient;
      maskContext.beginPath();
      maskContext.arc(x, y, radius, 0, Math.PI * 2);
      maskContext.fill();
    }
    revealContext.globalCompositeOperation = 'destination-in';
    revealContext.drawImage(maskCanvas, 0, 0, state.rect.width, state.rect.height);
    revealContext.globalCompositeOperation = 'source-over';
  };

  const updatePointer = (event) => {
    const rect = interaction.getBoundingClientRect();
    state.rect = rect;
    imageLayout(rect);
    cursor.style.left = `${event.clientX - rect.left}px`;
    cursor.style.top = `${event.clientY - rect.top}px`;
    cursor.classList.add('is-visible');
    if (state.active) {
      const point = pointToSource(event);
      if (isInBeard(point)) {
        const previous = state.points[state.points.length - 1];
        if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 18) {
          state.points.push(point);
          draw();
        }
      }
    }
  };

  const start = (event) => {
    event.preventDefault();
    state.active = true;
    interaction.setPointerCapture?.(event.pointerId);
    updatePointer(event);
    const point = pointToSource(event);
    if (isInBeard(point)) {
      state.points.push(point);
      draw();
    }
    interaction.classList.add('is-shaving');
  };

  const stop = () => {
    state.active = false;
    interaction.classList.remove('is-shaving');
  };

  const resize = () => {
    state.rect = interaction.getBoundingClientRect();
    imageLayout(state.rect);
    draw();
  };

  interaction.addEventListener('pointermove', updatePointer, {passive: false});
  interaction.addEventListener('pointerdown', start, {passive: false});
  interaction.addEventListener('pointerup', stop);
  interaction.addEventListener('pointercancel', stop);
  interaction.addEventListener('pointerleave', stop);
  interaction.addEventListener('pointerenter', updatePointer, {passive: false});
  window.addEventListener('resize', resize, {passive: true});
  Promise.all([background.decode?.() || Promise.resolve(), maskImage.decode?.() || Promise.resolve()]).then(resize);
})();
